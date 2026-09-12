import type { Ctx } from "./bot.js";
import type { StorageAdapter } from "grammy";

export type Flow =
  | { kind: "profile"; field?: "name" | "phone" | "city" | "address"; draft: { name?: string; phone?: string; city?: string; address?: string } }
  | { kind: "catalog" }
  | { kind: "category"; categoryId: string }
  | { kind: "cart"; returnProductId?: string; returnCategoryId?: string }
  | { kind: "checkout"; step: "name" | "phone" | "city" | "address" | "delivery" | "payment" | "promo" | "summary"; editing?: boolean }
  | { kind: "promo-create"; step: "code" | "discount"; code?: string }
  | { kind: "promo-edit"; id: string; step: "code" | "discount"; code?: string; discount?: number }
  | { kind: "category-create"; retried?: boolean }
  | { kind: "product-create"; categoryId: string; step: "name" | "photo" | "description" | "price" | "availability"; name?: string; photo?: string; description?: string; price?: number; availability?: "in_stock" | "out_of_stock"; stockCount?: number }
  | { kind: "product-edit"; productId: string; categoryId: string; step: "name" | "photo" | "description" | "price" | "availability" | "field"; field?: "name" | "photo" | "description" | "price" | "availability" | "category"; name?: string; photo?: string; description?: string; price?: number; availability?: "in_stock" | "out_of_stock"; stockCount?: number }
  | undefined;

export interface Profile { id: string; lastSeen: number; name?: string; phone?: string; city?: string; address?: string; email?: string; }
export interface CatalogProduct { id: string; categoryId: string; name: string; photo?: string; price: number; currency: string; description: string; availability: "in_stock" | "out_of_stock"; stockCount?: number; createdAt: number; updatedAt: number; }
export interface CatalogCategory { id: string; name: string; }
export interface CartLine { productId: string; quantity: number; unitPrice?: number; catalogUpdatedAt?: number; }
export interface OrderLine { productId: string; name: string; unitPrice: number; quantity: number; subtotal: number; }
export interface CustomerData { name: string; phone: string; city: string; address: string; }
export const DELIVERY_METHODS = {
  delivery_address: "🚚 Доставка по адресу",
  pickup: "🏪 Самовывоз",
} as const;
export type DeliveryMethodValue = keyof typeof DELIVERY_METHODS;
export interface DeliveryMethod { value: DeliveryMethodValue; label: (typeof DELIVERY_METHODS)[DeliveryMethodValue]; }
export const PAYMENT_METHODS = {
  card: "💳 Оплата картой",
  cash_on_delivery: "💵 Наличными при получении",
} as const;
export type PaymentMethodValue = keyof typeof PAYMENT_METHODS;
export interface PaymentMethod { value: PaymentMethodValue; label: (typeof PAYMENT_METHODS)[PaymentMethodValue]; }
export const ORDER_STATUSES = ["🆕 Новый", "🔄 В обработке", "📦 Собирается", "🚚 Отправлен", "✅ Выполнен", "❌ Отменён"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** Plain status names used in buyer notifications. Keep card labels unchanged. */
export const ORDER_STATUS_NAMES: Record<OrderStatus, string> = {
  "🆕 Новый": "Новый",
  "🔄 В обработке": "В обработке",
  "📦 Собирается": "Собирается",
  "🚚 Отправлен": "Отправлен",
  "✅ Выполнен": "Выполнен",
  "❌ Отменён": "Отменён",
};
export interface Order { id: string; userId: string; createdAt: number; lines: OrderLine[]; itemsSubtotal: number; totalAmount: number; currency: string; customer: CustomerData; delivery_method: DeliveryMethod; payment_method: PaymentMethod; status: OrderStatus; appliedPromoCodeId?: string; appliedPromoCode?: string; appliedDiscountPercent?: number; discountAmount?: number; finalTotal: number; }
export interface PromoCode { id: string; code: string; discountPercent: number; active: boolean; createdAt: number; updatedAt: number; createdByAdminId?: string; }
function normalizeOrderStatus(status: unknown): OrderStatus {
  if (ORDER_STATUSES.includes(status as OrderStatus)) return status as OrderStatus;
  if (status === "paid") return "✅ Выполнен";
  if (status === "cancelled") return "❌ Отменён";
  return "🆕 Новый";
}
export interface CheckoutDraft { name?: string; phone?: string; city?: string; address?: string; delivery_method?: DeliveryMethod; payment_method?: PaymentMethod; promoCode?: string; appliedPromoCodeId?: string; itemsSubtotal?: number; appliedDiscountPercent?: number; discountAmount?: number; finalTotal?: number; updatedAt: number; }
/** Prevent accidental or malicious cart totals from becoming unmanageable. */
export const MAX_CART_QUANTITY = 99;
export interface State { version: 2; users: Record<string, Profile>; catalog: CatalogProduct[]; categories: CatalogCategory[]; carts: Record<string, CartLine[]>; orders: Record<string, Order[]>; promoCodes: PromoCode[]; checkoutDrafts: Record<string, CheckoutDraft>; }

let adapter: StorageAdapter<unknown> | undefined;
let clock = () => Date.now();
let queue: Promise<unknown> = Promise.resolve();
const KEY = "storefront:state:v2";
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
const empty = (): State => ({ version: 2, users: {}, catalog: initialProducts.map((product) => ({ ...product })), categories: initialCategories.map((category) => ({ ...category })), carts: {}, orders: {}, promoCodes: [], checkoutDrafts: {} });
export const now = () => clock();
export function setClockForTests(fn?: () => number) { clock = fn ?? (() => Date.now()); }
export function configureDomainStore(next: StorageAdapter<unknown>) { adapter = next; }
async function read() {
  const saved = (await adapter?.read(KEY)) as Partial<State> | undefined;
  if (!saved) return empty();
  const catalog = (saved.catalog ?? empty().catalog).map((product) => ({ ...product, createdAt: product.createdAt ?? 0, updatedAt: product.updatedAt ?? product.createdAt ?? 0 }));
  const orders = Object.fromEntries(Object.entries(saved.orders ?? {}).map(([userId, userOrders]) => [
    userId,
    (userOrders ?? []).map((order) => ({
      ...order,
      status: normalizeOrderStatus(order.status),
      delivery_method: order.delivery_method ?? { value: "delivery_address", label: DELIVERY_METHODS.delivery_address },
      finalTotal: order.finalTotal ?? order.totalAmount,
    })),
  ]));
  return { ...empty(), catalog, categories: saved.categories ?? empty().categories, carts: saved.carts ?? {}, orders, promoCodes: saved.promoCodes ?? [], checkoutDrafts: saved.checkoutDrafts ?? {}, users: Object.fromEntries(Object.entries(saved.users ?? {}).map(([id, profile]) => [id, { id, lastSeen: profile?.lastSeen ?? 0, name: profile?.name, phone: profile?.phone, city: profile?.city, address: profile?.address, email: profile?.email }])) } as State;
}
async function write(s: State) { if (!adapter) throw new Error("Store is not configured"); await adapter.write(KEY, s); }
export async function transaction<T>(fn: (s: State) => T | Promise<T>): Promise<T> { const run = queue.then(async () => { const s = await read(); const result = await fn(s); await write(s); return result; }); queue = run.then(() => undefined, () => undefined); return run; }
export async function snapshot() { return read(); }
export function userId(ctx: Ctx) { return String(ctx.from?.id ?? ctx.chat?.id ?? "unknown"); }
const newProfile = (id: string): Profile => ({ id, lastSeen: now() });
export async function getProfile(ctx: Ctx) { return transaction((s) => { const id = userId(ctx); return s.users[id] ?? (s.users[id] = newProfile(id)); }); }
export async function touch(ctx: Ctx) { return transaction((s) => { const p = s.users[userId(ctx)] ?? (s.users[userId(ctx)] = newProfile(userId(ctx))); p.lastSeen = now(); return p; }); }
export async function updateProfile(ctx: Ctx, patch: Partial<Profile>) { return transaction((s) => { const id = userId(ctx); const p = s.users[id] ?? (s.users[id] = newProfile(id)); Object.assign(p, patch, { lastSeen: now() }); return p; }); }

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
export async function addToCart(ctx: Ctx, productId: string, quantity = 1) { return transaction((s) => { const product = s.catalog.find((entry) => entry.id === productId); if (!product || !Number.isInteger(quantity) || quantity < 1 || product.availability !== "in_stock") return false; const uid = userId(ctx); const lines = s.carts[uid] ?? (s.carts[uid] = []); const line = lines.find((entry) => entry.productId === productId); if (line) { if (line.quantity + quantity > MAX_CART_QUANTITY) return false; line.quantity += quantity; line.unitPrice = line.unitPrice ?? product.price; line.catalogUpdatedAt = line.catalogUpdatedAt ?? product.updatedAt; } else lines.push({ productId, quantity, unitPrice: product.price, catalogUpdatedAt: product.updatedAt }); syncCheckoutPricing(s, uid); return true; }); }
export async function changeCartQuantity(ctx: Ctx, productId: string, delta: number) { return transaction((s) => { if (!Number.isInteger(delta) || delta === 0) return false; const uid = userId(ctx); const lines = s.carts[uid] ?? []; const line = lines.find((entry) => entry.productId === productId); if (!line || line.quantity + delta > MAX_CART_QUANTITY) return false; line.quantity += delta; if (line.quantity <= 0) s.carts[uid] = lines.filter((entry) => entry.productId !== productId); syncCheckoutPricing(s, uid); return true; }); }
export async function removeFromCart(ctx: Ctx, productId: string) { return transaction((s) => { const uid = userId(ctx); const lines = s.carts[uid] ?? []; const before = lines.length; s.carts[uid] = lines.filter((entry) => entry.productId !== productId); syncCheckoutPricing(s, uid); return s.carts[uid].length !== before; }); }
export async function clearCart(ctx: Ctx) { return transaction((s) => { const uid = userId(ctx); s.carts[uid] = []; syncCheckoutPricing(s, uid); }); }

export async function getCheckoutDraft(ctx: Ctx) {
  return (await snapshot()).checkoutDrafts[userId(ctx)];
}

export async function saveCheckoutDraft(ctx: Ctx, patch: Partial<Omit<CheckoutDraft, "updatedAt">>) {
  return transaction((s) => {
    const id = userId(ctx);
    const draft = s.checkoutDrafts[id] ?? (s.checkoutDrafts[id] = { updatedAt: now() });
    Object.assign(draft, patch, { updatedAt: now() });
    syncCheckoutPricing(s, id);
    return { ...draft };
  });
}

export async function clearCheckoutDraft(ctx: Ctx) {
  return transaction((s) => { delete s.checkoutDrafts[userId(ctx)]; });
}

export function normalizePromoCode(code: string) {
  return code.trim().toLocaleUpperCase();
}

export function validatePromoDiscount(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 100;
}

export function recalculateOrderTotal(subtotal: number, discountPercent = 0) {
  const safeSubtotal = Math.max(0, Math.round(subtotal * 100) / 100);
  const safePercent = validatePromoDiscount(discountPercent) ? discountPercent : 0;
  const discountAmount = Math.round(safeSubtotal * safePercent / 100 * 100) / 100;
  return { discountAmount, finalTotal: Math.max(0, Math.round((safeSubtotal - discountAmount) * 100) / 100) };
}

export interface CheckoutPricing {
  itemsSubtotal: number;
  promo?: PromoCode;
  discountPercent: number;
  discountAmount: number;
  finalTotal: number;
}

function checkoutPricing(state: State, uid: string): CheckoutPricing {
  const products = new Map(state.catalog.map((product) => [product.id, product]));
  const itemsSubtotal = (state.carts[uid] ?? []).reduce((sum, line) => {
    const product = products.get(line.productId);
    return sum + (product ? product.price * line.quantity : 0);
  }, 0);
  const draft = state.checkoutDrafts[uid];
  const promo = draft?.promoCode
    ? state.promoCodes.find((entry) => entry.code === normalizePromoCode(draft.promoCode!) && entry.active)
    : undefined;
  const totals = recalculateOrderTotal(itemsSubtotal, promo?.discountPercent ?? 0);
  return {
    itemsSubtotal: Math.round(itemsSubtotal * 100) / 100,
    promo,
    discountPercent: promo?.discountPercent ?? 0,
    discountAmount: totals.discountAmount,
    finalTotal: totals.finalTotal,
  };
}

function syncCheckoutPricing(state: State, uid: string) {
  const draft = state.checkoutDrafts[uid];
  if (!draft) return;
  const pricing = checkoutPricing(state, uid);
  Object.assign(draft, {
    itemsSubtotal: pricing.itemsSubtotal,
    appliedPromoCodeId: pricing.promo?.id,
    appliedDiscountPercent: pricing.promo?.discountPercent,
    discountAmount: pricing.discountAmount,
    finalTotal: pricing.finalTotal,
    updatedAt: now(),
  });
}

export async function getCheckoutPricing(ctx: Ctx) {
  return checkoutPricing(await snapshot(), userId(ctx));
}

export async function listPromoCodes() { return (await snapshot()).promoCodes.map((promo) => ({ ...promo })); }

export async function createPromoCode(ctx: Ctx, code: string, discountPercent: number) {
  const normalized = normalizePromoCode(code);
  if (!normalized || !validatePromoDiscount(discountPercent)) return undefined;
  return transaction((s) => {
    if (s.promoCodes.some((promo) => promo.code === normalized)) return undefined;
    const timestamp = now();
    const promo: PromoCode = { id: `promo:${timestamp}:${s.promoCodes.length}`, code: normalized, discountPercent, active: true, createdAt: timestamp, updatedAt: timestamp, createdByAdminId: userId(ctx) };
    s.promoCodes.push(promo);
    return promo;
  });
}

export async function updatePromoCode(id: string, code: string, discountPercent: number) {
  const normalized = normalizePromoCode(code);
  if (!normalized || !validatePromoDiscount(discountPercent)) return undefined;
  return transaction((s) => {
    const promo = s.promoCodes.find((entry) => entry.id === id);
    if (!promo || s.promoCodes.some((entry) => entry.id !== id && entry.code === normalized)) return undefined;
    Object.assign(promo, { code: normalized, discountPercent, updatedAt: now() });
    return promo;
  });
}

export async function togglePromoCode(id: string) { return transaction((s) => { const promo = s.promoCodes.find((entry) => entry.id === id); if (!promo) return undefined; promo.active = !promo.active; promo.updatedAt = now(); return promo; }); }
export async function deletePromoCode(id: string) { return transaction((s) => { const before = s.promoCodes.length; s.promoCodes = s.promoCodes.filter((promo) => promo.id !== id); return s.promoCodes.length !== before; }); }

export async function applyPromoCode(ctx: Ctx, code: string) {
  const normalized = normalizePromoCode(code);
  return transaction((s) => {
    const uid = userId(ctx);
    const draft = s.checkoutDrafts[uid] ?? (s.checkoutDrafts[uid] = { updatedAt: now() });
    const promo = s.promoCodes.find((entry) => entry.code === normalized && entry.active);
    if (!promo) return { status: "invalid" as const };
    if (draft.promoCode === normalized) return { status: "already" as const, draft: { ...draft } };
    const pricing = checkoutPricing(s, uid);
    const totals = recalculateOrderTotal(pricing.itemsSubtotal, promo.discountPercent);
    Object.assign(draft, { promoCode: promo.code, appliedPromoCodeId: promo.id, itemsSubtotal: pricing.itemsSubtotal, appliedDiscountPercent: promo.discountPercent, discountAmount: totals.discountAmount, finalTotal: totals.finalTotal, updatedAt: now() });
    return { status: "applied" as const, promo, draft: { ...draft } };
  });
}

export async function createOrderFromCheckout(ctx: Ctx, customer: CustomerData, delivery_method: DeliveryMethod, payment_method: PaymentMethod) {
  return transaction((s) => {
    const uid = userId(ctx);
    const cart = s.carts[uid] ?? [];
    const products = new Map(s.catalog.map((product) => [product.id, product]));
    const lines: OrderLine[] = [];
    for (const line of cart) {
      const product = products.get(line.productId);
      if (!product || product.availability !== "in_stock" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_CART_QUANTITY) return undefined;
      lines.push({ productId: product.id, name: product.name, unitPrice: product.price, quantity: line.quantity, subtotal: product.price * line.quantity });
    }
    if (!lines.length) return undefined;
    const createdAt = now();
    const date = new Date(createdAt);
    const stamp = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const existing = s.orders[uid] ?? (s.orders[uid] = []);
    let id = `ORD-${stamp}`;
    let suffix = 2;
    const allOrders = Object.values(s.orders).flat();
    while (allOrders.some((order) => order.id === id)) id = `ORD-${stamp}-${suffix++}`;
    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const draft = s.checkoutDrafts[uid];
    const promo = draft?.promoCode ? s.promoCodes.find((entry) => entry.code === normalizePromoCode(draft.promoCode!) && entry.active) : undefined;
    const totals = recalculateOrderTotal(subtotal, promo?.discountPercent ?? 0);
    const order: Order = { id, userId: uid, createdAt, lines, itemsSubtotal: Math.round(subtotal * 100) / 100, totalAmount: totals.finalTotal, currency: products.get(lines[0].productId)!.currency, customer, delivery_method, payment_method, status: "🆕 Новый", appliedPromoCodeId: promo?.id, appliedPromoCode: promo?.code, appliedDiscountPercent: promo?.discountPercent, discountAmount: totals.discountAmount, finalTotal: totals.finalTotal };
    existing.push(order);
    s.carts[uid] = [];
    delete s.checkoutDrafts[uid];
    return order;
  });
}

/** Orders are read through the persisted user-to-orders index, never a key scan. */
export async function listOrders(page = 0, pageSize = 10) {
  const state = await snapshot();
  const orders = Object.values(state.orders)
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt);
  const size = Math.max(1, Math.min(50, Math.trunc(pageSize)));
  const pages = Math.max(1, Math.ceil(orders.length / size));
  const current = Math.min(Math.max(0, Math.trunc(page)), pages - 1);
  return { orders: orders.slice(current * size, (current + 1) * size), total: orders.length, page: current, pages, pageSize: size };
}

export async function getOrder(orderId: string) {
  const state = await snapshot();
  for (const orders of Object.values(state.orders)) {
    const order = orders.find((entry) => entry.id === orderId);
    if (order) return order;
  }
  return undefined;
}

/** Read a buyer's order through that buyer's own persisted index. */
export async function getUserOrder(ctx: Ctx, orderId: string) {
  const orders = (await snapshot()).orders[userId(ctx)] ?? [];
  return orders.find((order) => order.id === orderId);
}

/** Return only orders belonging to the authenticated customer. */
export async function listUserOrders(ctx: Ctx) {
  return [...((await snapshot()).orders[userId(ctx)] ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  if (!ORDER_STATUSES.includes(status)) return undefined;
  return transaction((s) => {
    for (const orders of Object.values(s.orders)) {
      const order = orders.find((entry) => entry.id === orderId);
      if (order) {
        const changed = order.status !== status;
        order.status = status;
        return { order, changed };
      }
    }
    return undefined;
  });
}
