import type { Ctx } from "./bot.js";

export type Flow =
  | { kind: "ticker" }
  | { kind: "threshold"; ticker: string; price?: number }
  | { kind: "percent"; ticker: string; percent?: number }
  | { kind: "timezone" }
  | { kind: "quiet-start" }
  | { kind: "quiet-end" }
  | { kind: "digest-time" }
  | { kind: "cooldown" }
  | undefined;

export interface Alert {
  id: string;
  ticker: string;
  type: "price_threshold" | "percent_change";
  price?: number;
  direction?: "above" | "below";
  percent?: number;
  windowMinutes?: number;
  baseline?: number;
  createdAt: number;
  lastTriggeredAt?: number;
  armed: boolean;
}
export interface Item { ticker: string; name: string; addedAt: number; lastPrice?: number; }
export interface UserData {
  timezone: string; fiat: string; quietStart?: string; quietEnd?: string;
  digestEnabled: boolean; digestTime: string; cooldownHours: number; hysteresis: number;
  items: Item[]; alerts: Alert[]; queued: { ticker: string; note: string; at: number }[];
  errors: number;
}

const seeds: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" }, ETH: { id: "ethereum", name: "Ethereum" }, TON: { id: "the-open-network", name: "Toncoin" },
};
const ids: Record<string, string> = { ...Object.fromEntries(Object.entries(seeds).map(([s, v]) => [s, v.id])), SOL: "solana", ADA: "cardano", DOGE: "dogecoin", XRP: "ripple" };
let clock: () => number = () => Date.now();
export const now = () => clock();
export function setClockForTests(fn?: () => number) { clock = fn ?? (() => Date.now()); }

export function data(ctx: Ctx): UserData {
  return (ctx.session.data ??= { timezone: "UTC", fiat: "USD", digestEnabled: false, digestTime: "08:00", cooldownHours: 6, hysteresis: 0.5, items: [], alerts: [], queued: [], errors: 0 });
}
export function symbol(input: string): string | undefined { const s = input.trim().toUpperCase(); return /^[A-Z0-9]{2,12}$/.test(s) ? s : undefined; }
export function item(ctx: Ctx, ticker: string) { return data(ctx).items.find((x) => x.ticker === ticker); }
export function keyboardBack() { return { inline_keyboard: [[{ text: "Back to menu", callback_data: "menu:main" }]] }; }
export function itemKeyboard(ticker: string) { return { inline_keyboard: [
  [{ text: "Add price alert", callback_data: `alert:price:${ticker}` }, { text: "Add percent alert", callback_data: `alert:percent:${ticker}` }],
  [{ text: "Edit alerts", callback_data: `watchlist:edit:${ticker}` }, { text: "Check price", callback_data: `price:one:${ticker}` }],
  [{ text: "Delete", callback_data: `watchlist:delete:${ticker}` }], [{ text: "My list", callback_data: "watchlist:view" }],
] }; }
export function formatPrice(price: number, fiat: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency: fiat, maximumFractionDigits: price < 1 ? 6 : 2 }).format(price); }
export function timeText(ts = now()) { return new Date(ts).toISOString().replace("T", " ").slice(0, 16) + " UTC"; }
export function validTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function inQuietHours(d: UserData, at = now()): boolean {
  if (!d.quietStart || !d.quietEnd || d.quietStart === d.quietEnd) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: d.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const t = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
  return d.quietStart < d.quietEnd ? t >= d.quietStart && t < d.quietEnd : t >= d.quietStart || t < d.quietEnd;
}

async function request(url: string): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (r.ok) return r; last = r.status; } catch (e) { last = e; } }
  throw new Error(`price source unavailable: ${String(last)}`);
}
export async function price(ticker: string, fiat: string): Promise<number | undefined> {
  const id = ids[ticker]; if (!id) return undefined;
  const r = await request(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(fiat.toLowerCase())}`);
  const json = await r.json() as Record<string, Record<string, number>>;
  return json[id]?.[fiat.toLowerCase()];
}
export async function addTicker(ctx: Ctx, ticker: string): Promise<Item | undefined> {
  const d = data(ctx); if (item(ctx, ticker)) return item(ctx, ticker);
  // The menu seeds have canonical CoinGecko metadata; unfamiliar symbols are
  // verified against the live source before being added.
  const p = seeds[ticker] ? undefined : await price(ticker, d.fiat);
  if (!seeds[ticker] && p === undefined) return undefined;
  const added = { ticker, name: seeds[ticker]?.name ?? ticker, addedAt: now(), lastPrice: p };
  d.items.push(added); return added;
}
export async function showPrice(ctx: Ctx, ticker: string): Promise<string | undefined> {
  const d = data(ctx); const p = await price(ticker, d.fiat); if (p === undefined) return undefined;
  const found = item(ctx, ticker); if (found) found.lastPrice = p;
  return `${ticker}: ${formatPrice(p, d.fiat)}\nSource: CoinGecko · ${timeText()}`;
}
export function addAlert(ctx: Ctx, alert: Omit<Alert, "id" | "createdAt" | "armed">) {
  const d = data(ctx); d.alerts.push({ ...alert, id: `${alert.ticker}-${now()}-${d.alerts.length}`, createdAt: now(), armed: true });
}
export function deleteTicker(ctx: Ctx, ticker: string) { const d = data(ctx); d.items = d.items.filter((x) => x.ticker !== ticker); d.alerts = d.alerts.filter((x) => x.ticker !== ticker); }
export function page(ctx: Ctx, n: number) { return data(ctx).items.slice(n * 5, n * 5 + 5); }
