import type { Ctx } from "./bot.js";
import type { StorageAdapter } from "grammy";

export type Flow =
  | { kind: "add" }
  | { kind: "edit"; itemId: string }
  | { kind: "price"; itemId: string }
  | { kind: "percent"; itemId: string; percent?: number; window?: string }
  | { kind: "settings"; step: "timezone" | "quiet" | "summary" | "cooldown" }
  | { kind: "profile"; field: "name" | "email" | "address" | "phone" }
  | { kind: "catalog" }
  | { kind: "category"; categoryId: string }
  | { kind: "category-create"; retried?: boolean }
  | { kind: "product-create"; categoryId: string; step: "name" | "photo" | "description" | "price" | "availability"; name?: string; photo?: string; description?: string; price?: number; availability?: "in_stock" | "out_of_stock"; stockCount?: number }
  | { kind: "product-edit"; productId: string; categoryId: string; step: "name" | "photo" | "description" | "price" | "availability"; name?: string; photo?: string; description?: string; price?: number; availability?: "in_stock" | "out_of_stock"; stockCount?: number }
  | undefined;

export interface Profile { id: string; timezone: string; fiat: string; quietStart?: string; quietEnd?: string; morning: boolean; summaryTime?: string; cooldown: number; hysteresis: number; lastSeen: number; name?: string; email?: string; address?: string; phone?: string; }
export interface Item { id: string; ticker: string; name: string; addedAt: number; lastPrice?: number; }
export interface CatalogProduct { id: string; categoryId: string; name: string; photo: string; price: number; currency: string; description: string; availability: "in_stock" | "out_of_stock"; stockCount?: number; createdAt: number; updatedAt: number; }
export interface CatalogCategory { id: string; name: string; }
export interface CartLine { productId: string; quantity: number; }
export interface Order { id: string; lines: CartLine[]; subtotal: number; currency: string; createdAt: number; status: "pending" | "paid" | "cancelled"; }
export interface Alert { id: string; itemId: string; type: "threshold" | "percent"; price?: number; direction?: "above" | "below"; percent?: number; window?: string; baseline?: number; createdAt: number; lastTriggered?: number; cooldownHours: number; enabled: boolean; }
export interface Queued { id: string; itemId: string; ticker: string; detectedAt: number; note: string; }
export interface State { version: 1; users: Record<string, Profile>; items: Record<string, Item[]>; alerts: Record<string, Alert[]>; queued: Record<string, Queued[]>; catalog: CatalogProduct[]; categories: CatalogCategory[]; carts: Record<string, CartLine[]>; orders: Record<string, Order[]>; metrics: { triggers: Record<string, number>; errors: number }; config: { cooldown: number; hysteresis: number; percentWindow: string; topN: number }; }

let adapter: StorageAdapter<unknown> | undefined;
let clock = () => Date.now();
let queue: Promise<unknown> = Promise.resolve();
const KEY = "cryptowatch:state:v1";
const initialCategories: CatalogCategory[] = [
  { id: "electronics", name: "Электроника" },
  { id: "clothing", name: "Одежда" },
  { id: "books", name: "Книги" },
  { id: "home-and-garden", name: "Дом и сад" },
];
const initialProducts: CatalogProduct[] = [
  { id: "electronics:desk-lamp", categoryId: "electronics", name: "Настольная лампа", photo: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=640", description: "Компактная лампа для рабочего стола.", price: 2490, currency: "RUB", availability: "in_stock", createdAt: 0, updatedAt: 0 },
  { id: "clothing:hoodie", categoryId: "clothing", name: "Базовый худи", photo: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=640", description: "Мягкий хлопковый худи на каждый день.", price: 3990, currency: "RUB", availability: "in_stock", createdAt: 0, updatedAt: 0 },
  { id: "books:design-book", categoryId: "books", name: "Книга о дизайне", photo: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=640", description: "Практическое введение в принципы дизайна.", price: 1290, currency: "RUB", availability: "out_of_stock", createdAt: 0, updatedAt: 0 },
  { id: "home-and-garden:planter", categoryId: "home-and-garden", name: "Керамическое кашпо", photo: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=640", description: "Керамическое кашпо для домашних растений.", price: 1890, currency: "RUB", availability: "in_stock", createdAt: 0, updatedAt: 0 },
];
const empty = (): State => ({ version: 1, users: {}, items: {}, alerts: {}, queued: {}, catalog: initialProducts.map((product) => ({ ...product })), categories: initialCategories.map((category) => ({ ...category })), carts: {}, orders: {}, metrics: { triggers: {}, errors: 0 }, config: { cooldown: 6, hysteresis: 0.5, percentWindow: "1h", topN: 10 } });
export const now = () => clock();
export function setClockForTests(fn?: () => number) { clock = fn ?? (() => Date.now()); }
export function configureDomainStore(next: StorageAdapter<unknown>) { adapter = next; }
async function read() {
  const saved = (await adapter?.read(KEY)) as Partial<State> | undefined;
  if (!saved) return empty();
  const catalog = (saved.catalog ?? empty().catalog).map((product) => ({ ...product, createdAt: product.createdAt ?? 0, updatedAt: product.updatedAt ?? product.createdAt ?? 0 }));
  return { ...empty(), ...saved, catalog, categories: saved.categories ?? empty().categories, carts: saved.carts ?? {}, orders: saved.orders ?? {}, metrics: { ...empty().metrics, ...saved.metrics }, config: { ...empty().config, ...saved.config } } as State;
}
async function write(s: State) { if (!adapter) throw new Error("Store is not configured"); await adapter.write(KEY, s); }
export async function transaction<T>(fn: (s: State) => T | Promise<T>): Promise<T> { const run = queue.then(async () => { const s = await read(); const result = await fn(s); await write(s); return result; }); queue = run.then(() => undefined, () => undefined); return run; }
export async function snapshot() { return read(); }
export function userId(ctx: Ctx) { return String(ctx.from?.id ?? ctx.chat?.id ?? "unknown"); }
const newProfile = (id: string): Profile => ({ id, timezone: "UTC", fiat: "USD", morning: false, cooldown: 6, hysteresis: 0.5, lastSeen: now() });
export async function getProfile(ctx: Ctx) { return transaction((s) => { const id = userId(ctx); return s.users[id] ?? (s.users[id] = newProfile(id)); }); }
export async function touch(ctx: Ctx) { return transaction((s) => { const p = s.users[userId(ctx)] ?? (s.users[userId(ctx)] = newProfile(userId(ctx))); p.lastSeen = now(); return p; }); }
export async function addItem(ctx: Ctx, item: Omit<Item, "id" | "addedAt">) { return transaction((s) => { const uid = userId(ctx); const list = s.items[uid] ?? (s.items[uid] = []); const found = list.find((x) => x.ticker === item.ticker); if (found) return { item: found, existed: true }; const saved = { ...item, id: `${uid}:${item.ticker}`, addedAt: now() }; list.push(saved); return { item: saved, existed: false }; }); }
export async function removeItem(ctx: Ctx, id: string) { return transaction((s) => { const uid = userId(ctx); const list = s.items[uid] ?? []; const item = list.find((x) => x.id === id); if (!item) return false; s.items[uid] = list.filter((x) => x.id !== id); s.alerts[uid] = (s.alerts[uid] ?? []).filter((a) => a.itemId !== id); return true; }); }
export async function renameItem(ctx: Ctx, id: string, ticker: string, name: string, price: number) { return transaction((s) => { const item = (s.items[userId(ctx)] ?? []).find((x) => x.id === id); if (!item) return false; item.ticker = ticker; item.name = name; item.lastPrice = price; return true; }); }
export async function saveAlert(ctx: Ctx, alert: Omit<Alert, "id" | "createdAt" | "enabled">) { return transaction((s) => { const uid = userId(ctx); const saved = { ...alert, id: `${uid}:${now()}:${(s.alerts[uid] ?? []).length}`, createdAt: now(), cooldownHours: alert.cooldownHours ?? s.users[uid]?.cooldown ?? s.config.cooldown, enabled: true }; (s.alerts[uid] ?? (s.alerts[uid] = [])).push(saved); return saved; }); }
export async function updateProfile(ctx: Ctx, patch: Partial<Profile>) { return transaction((s) => { const id = userId(ctx); const p = s.users[id] ?? (s.users[id] = newProfile(id)); Object.assign(p, patch, { lastSeen: now() }); return p; }); }
export async function queueAlert(ctx: Ctx, q: Omit<Queued, "detectedAt">) { return transaction((s) => { (s.queued[userId(ctx)] ?? (s.queued[userId(ctx)] = [])).push({ ...q, detectedAt: now() }); }); }
export async function takeQueued(ctx: Ctx) { return transaction((s) => { const q = s.queued[userId(ctx)] ?? []; s.queued[userId(ctx)] = []; return q; }); }
export async function incrementTrigger(ticker: string) { return transaction((s) => { s.metrics.triggers[ticker] = (s.metrics.triggers[ticker] ?? 0) + 1; }); }

/** Hook for a future catalog service or owner import. Products are durable. */
export async function addCatalogProduct(product: CatalogProduct) { return transaction((s) => { const index = s.catalog.findIndex((entry) => entry.id === product.id); if (index >= 0) s.catalog[index] = product; else s.catalog.push(product); return product; }); }
export async function listCatalogCategories() { return (await snapshot()).categories; }
export async function getCatalogCategory(id: string) { return (await snapshot()).categories.find((category) => category.id === id); }
export async function listCatalogProducts(categoryId: string) { return (await snapshot()).catalog.filter((product) => product.categoryId === categoryId); }
export async function getCatalogProduct(id: string) { return (await snapshot()).catalog.find((product) => product.id === id); }
export async function createCatalogProduct(product: Omit<CatalogProduct, "id" | "createdAt" | "updatedAt">) {
  return transaction((s) => {
    const base = product.categoryId + ":" + product.name.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "product";
    let id = base;
    let suffix = 2;
    while (s.catalog.some((entry) => entry.id === id)) id = base + "-" + suffix++;
    const timestamp = now();
    const saved = { ...product, id, createdAt: timestamp, updatedAt: timestamp };
    s.catalog.push(saved);
    return saved;
  });
}
export async function updateCatalogProduct(id: string, patch: Partial<Omit<CatalogProduct, "id" | "createdAt" | "updatedAt">>) {
  return transaction((s) => {
    const product = s.catalog.find((entry) => entry.id === id);
    if (!product) return undefined;
    Object.assign(product, patch, { updatedAt: now() });
    return product;
  });
}
export async function deleteCatalogProduct(id: string) {
  return transaction((s) => {
    const before = s.catalog.length;
    s.catalog = s.catalog.filter((entry) => entry.id !== id);
    return s.catalog.length !== before;
  });
}
export async function addCatalogCategory(name: string) {
  return transaction((s) => {
    const existing = s.categories.find((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return existing;
    const base = name.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "category";
    let id = base;
    let suffix = 2;
    while (s.categories.some((category) => category.id === id)) id = base + "-" + suffix++;
    const category = { id, name };
    s.categories.push(category);
    return category;
  });
}
export async function addToCart(ctx: Ctx, productId: string, quantity = 1) { return transaction((s) => { const product = s.catalog.find((entry) => entry.id === productId); if (!product || !Number.isInteger(quantity) || quantity < 1) return false; const lines = s.carts[userId(ctx)] ?? (s.carts[userId(ctx)] = []); const line = lines.find((entry) => entry.productId === productId); if (line) line.quantity += quantity; else lines.push({ productId, quantity }); return true; }); }
export async function clearCart(ctx: Ctx) { return transaction((s) => { s.carts[userId(ctx)] = []; }); }
