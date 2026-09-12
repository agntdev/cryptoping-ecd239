import type { Ctx } from "./bot.js";
import type { StorageAdapter } from "grammy";

export type Flow =
  | { kind: "product"; id?: string; step: "title" | "description" | "price" | "currency" | "photo" | "stock"; values: Partial<Product> }
  | { kind: "cart_quantity"; productId: string }
  | { kind: "checkout"; step: "name" | "phone" | "address"; values: Partial<Shipping> }
  | { kind: "profile"; step: "name" | "phone" | "address"; values: Partial<Shipping> }
  | undefined;

export interface Product {
  id: string; title: string; description: string; price: number; currency: string;
  photo?: string; stock: number; sku?: string; category?: string;
}
export interface CartLine { productId: string; quantity: number; }
export interface Shipping { name: string; phone: string; address: string; }
export interface UserRecord { id: string; profile?: Shipping; cart: CartLine[]; orderIds: string[]; activeAt: number; }
export interface Order {
  id: string; userId: string; items: Array<{ productId: string; title: string; quantity: number; price: number; currency: string }>;
  total: number; currency: string; shipping: Shipping; paymentStatus: "pending" | "paid" | "failed";
  status: "new" | "fulfilled" | "cancelled"; createdAt: number;
}
export interface StoreState {
  version: 1; nextProduct: number; nextOrder: number;
  products: Product[]; users: Record<string, UserRecord>; orders: Order[];
  productSales: Record<string, { quantity: number; revenue: number }>;
}

let adapter: StorageAdapter<unknown> | undefined;
let clock: () => number = () => Date.now();
let queue: Promise<unknown> = Promise.resolve();
const KEY = "store:state:v1";

export const now = () => clock();
export function setClockForTests(fn?: () => number) { clock = fn ?? (() => Date.now()); }
export function configureDomainStore(next: StorageAdapter<unknown>) { adapter = next; }
function empty(): StoreState { return { version: 1, nextProduct: 1, nextOrder: 1, products: [], users: {}, orders: [], productSales: {} }; }
async function read(): Promise<StoreState> { return ((await adapter?.read(KEY)) as StoreState | undefined) ?? empty(); }
async function write(state: StoreState) { if (!adapter) throw new Error("Store is not configured"); await adapter.write(KEY, state); }
export async function transaction<T>(fn: (state: StoreState) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => { const state = await read(); const result = await fn(state); await write(state); return result; });
  queue = run.then(() => undefined, () => undefined); return run;
}
export async function snapshot() { return read(); }
export function userId(ctx: Ctx) { return String(ctx.from?.id ?? ctx.chat?.id ?? "unknown"); }
export async function getUser(ctx: Ctx): Promise<UserRecord> {
  return transaction((s) => {
    const id = userId(ctx); const existing = s.users[id];
    if (existing) { existing.activeAt = now(); return existing; }
    const created = { id, cart: [], orderIds: [], activeAt: now() }; s.users[id] = created; return created;
  });
}
export async function saveProfile(ctx: Ctx, profile: Shipping) { return transaction((s) => { const id = userId(ctx); const u = s.users[id] ?? (s.users[id] = { id, cart: [], orderIds: [], activeAt: now() }); u.profile = profile; u.activeAt = now(); return u; }); }
export function findProduct(s: StoreState, id: string) { return s.products.find((p) => p.id === id); }
export function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value); }
export function validPhone(value: string) { return /^\+?[0-9 ()-]{7,20}$/.test(value.trim()); }
export function productId(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 32); }

export async function addProduct(input: Omit<Product, "id"> & { id?: string }) {
  return transaction((s) => { const id = productId(input.id ?? input.title) || `product-${s.nextProduct++}`; const existing = findProduct(s, id); if (existing) { Object.assign(existing, input, { id }); return existing; } const product = { ...input, id }; s.products.push(product); return product; });
}
export async function updateProduct(id: string, patch: Partial<Product>) { return transaction((s) => { const p = findProduct(s, id); if (!p) return undefined; Object.assign(p, patch); return p; }); }
export async function removeProduct(id: string) { return transaction((s) => { const at = s.products.findIndex((p) => p.id === id); if (at < 0) return false; s.products.splice(at, 1); return true; }); }
export async function setStock(id: string, stock: number) { return updateProduct(id, { stock }); }
export async function setOrderStatus(id: string, status: Order["status"]) { return transaction((s) => { const o = s.orders.find((x) => x.id === id); if (!o) return undefined; if (o.status === "new" && status === "cancelled") for (const item of o.items) { const p = findProduct(s, item.productId); if (p) p.stock += item.quantity; } o.status = status; return o; }); }
export async function resetMetrics() { return transaction((s) => { s.productSales = {}; }); }

export async function addToCart(ctx: Ctx, id: string, quantity = 1) {
  return transaction((s) => { const p = findProduct(s, id); if (!p) return "missing" as const; const u = s.users[userId(ctx)] ?? (s.users[userId(ctx)] = { id: userId(ctx), cart: [], orderIds: [], activeAt: now() }); const line = u.cart.find((x) => x.productId === id); const next = (line?.quantity ?? 0) + quantity; if (next > p.stock) return "stock" as const; if (line) line.quantity = next; else u.cart.push({ productId: id, quantity }); return "ok" as const; });
}
export async function changeCart(ctx: Ctx, id: string, delta: number) { return transaction((s) => { const u = s.users[userId(ctx)]; const line = u?.cart.find((x) => x.productId === id); if (!line) return false; line.quantity += delta; if (line.quantity <= 0) u!.cart = u!.cart.filter((x) => x !== line); return true; }); }
export async function removeCart(ctx: Ctx, id: string) { return transaction((s) => { const u = s.users[userId(ctx)]; if (!u) return false; u.cart = u.cart.filter((x) => x.productId !== id); return true; }); }
export async function clearCart(ctx: Ctx) { return transaction((s) => { const u = s.users[userId(ctx)]; if (u) u.cart = []; }); }

export async function createOrder(ctx: Ctx, shipping: Shipping) {
  return transaction((s) => {
    const uid = userId(ctx); const u = s.users[uid]; if (!u || !u.cart.length) return { error: "empty" as const };
    const lines = u.cart.map((line) => { const p = findProduct(s, line.productId); return p ? { p, line } : undefined; });
    if (lines.some((x) => !x || x.line.quantity > x.p.stock)) return { error: "stock" as const };
    const items = lines.map((x) => ({ productId: x!.p.id, title: x!.p.title, quantity: x!.line.quantity, price: x!.p.price, currency: x!.p.currency }));
    const order: Order = { id: `ORD-${String(s.nextOrder++).padStart(5, "0")}`, userId: uid, items, total: items.reduce((sum, x) => sum + x.price * x.quantity, 0), currency: items[0]?.currency ?? "RUB", shipping, paymentStatus: "pending", status: "new", createdAt: now() };
    for (const x of lines) x!.p.stock -= x!.line.quantity;
    for (const x of items) { const metric = s.productSales[x.productId] ?? (s.productSales[x.productId] = { quantity: 0, revenue: 0 }); metric.quantity += x.quantity; metric.revenue += x.price * x.quantity; }
    s.orders.push(order); u.orderIds.push(order.id); u.cart = []; u.profile = shipping; return { order };
  });
}
