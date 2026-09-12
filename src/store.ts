import type { Ctx } from "./bot.js";
import type { StorageAdapter } from "grammy";

export type Flow =
  | { kind: "add" }
  | { kind: "edit"; itemId: string }
  | { kind: "price"; itemId: string }
  | { kind: "percent"; itemId: string; percent?: number; window?: string }
  | { kind: "settings"; step: "timezone" | "quiet" | "summary" | "cooldown" }
  | undefined;

export interface Profile { id: string; timezone: string; fiat: string; quietStart?: string; quietEnd?: string; morning: boolean; summaryTime?: string; cooldown: number; hysteresis: number; lastSeen: number; }
export interface Item { id: string; ticker: string; name: string; addedAt: number; lastPrice?: number; }
export interface Alert { id: string; itemId: string; type: "threshold" | "percent"; price?: number; direction?: "above" | "below"; percent?: number; window?: string; baseline?: number; createdAt: number; lastTriggered?: number; cooldownHours: number; enabled: boolean; }
export interface Queued { id: string; itemId: string; ticker: string; detectedAt: number; note: string; }
export interface State { version: 1; users: Record<string, Profile>; items: Record<string, Item[]>; alerts: Record<string, Alert[]>; queued: Record<string, Queued[]>; metrics: { triggers: Record<string, number>; errors: number }; config: { cooldown: number; hysteresis: number; percentWindow: string; topN: number }; }

let adapter: StorageAdapter<unknown> | undefined;
let clock = () => Date.now();
let queue: Promise<unknown> = Promise.resolve();
const KEY = "cryptowatch:state:v1";
const empty = (): State => ({ version: 1, users: {}, items: {}, alerts: {}, queued: {}, metrics: { triggers: {}, errors: 0 }, config: { cooldown: 6, hysteresis: 0.5, percentWindow: "1h", topN: 10 } });
export const now = () => clock();
export function setClockForTests(fn?: () => number) { clock = fn ?? (() => Date.now()); }
export function configureDomainStore(next: StorageAdapter<unknown>) { adapter = next; }
async function read() { return ((await adapter?.read(KEY)) as State | undefined) ?? empty(); }
async function write(s: State) { if (!adapter) throw new Error("Store is not configured"); await adapter.write(KEY, s); }
export async function transaction<T>(fn: (s: State) => T | Promise<T>): Promise<T> { const run = queue.then(async () => { const s = await read(); const result = await fn(s); await write(s); return result; }); queue = run.then(() => undefined, () => undefined); return run; }
export async function snapshot() { return read(); }
export function userId(ctx: Ctx) { return String(ctx.from?.id ?? ctx.chat?.id ?? "unknown"); }
export async function getProfile(ctx: Ctx) { return transaction((s) => { const id = userId(ctx); return s.users[id] ?? (s.users[id] = { id, timezone: "UTC", fiat: "USD", morning: false, cooldown: 6, hysteresis: 0.5, lastSeen: now() }); }); }
export async function touch(ctx: Ctx) { return transaction((s) => { const p = s.users[userId(ctx)] ?? (s.users[userId(ctx)] = { id: userId(ctx), timezone: "UTC", fiat: "USD", morning: false, cooldown: 6, hysteresis: 0.5, lastSeen: now() }); p.lastSeen = now(); return p; }); }
export async function addItem(ctx: Ctx, item: Omit<Item, "id" | "addedAt">) { return transaction((s) => { const uid = userId(ctx); const list = s.items[uid] ?? (s.items[uid] = []); const found = list.find((x) => x.ticker === item.ticker); if (found) return { item: found, existed: true }; const saved = { ...item, id: `${uid}:${item.ticker}`, addedAt: now() }; list.push(saved); return { item: saved, existed: false }; }); }
export async function removeItem(ctx: Ctx, id: string) { return transaction((s) => { const uid = userId(ctx); const list = s.items[uid] ?? []; const item = list.find((x) => x.id === id); if (!item) return false; s.items[uid] = list.filter((x) => x.id !== id); s.alerts[uid] = (s.alerts[uid] ?? []).filter((a) => a.itemId !== id); return true; }); }
export async function renameItem(ctx: Ctx, id: string, ticker: string, name: string, price: number) { return transaction((s) => { const item = (s.items[userId(ctx)] ?? []).find((x) => x.id === id); if (!item) return false; item.ticker = ticker; item.name = name; item.lastPrice = price; return true; }); }
export async function saveAlert(ctx: Ctx, alert: Omit<Alert, "id" | "createdAt" | "enabled">) { return transaction((s) => { const uid = userId(ctx); const saved = { ...alert, id: `${uid}:${now()}:${(s.alerts[uid] ?? []).length}`, createdAt: now(), cooldownHours: alert.cooldownHours ?? s.users[uid]?.cooldown ?? s.config.cooldown, enabled: true }; (s.alerts[uid] ?? (s.alerts[uid] = [])).push(saved); return saved; }); }
export async function updateProfile(ctx: Ctx, patch: Partial<Profile>) { return transaction((s) => { const id = userId(ctx); const p = s.users[id] ?? (s.users[id] = { id, timezone: "UTC", fiat: "USD", morning: false, cooldown: 6, hysteresis: 0.5, lastSeen: now() }); Object.assign(p, patch, { lastSeen: now() }); return p; }); }
export async function queueAlert(ctx: Ctx, q: Omit<Queued, "detectedAt">) { return transaction((s) => { (s.queued[userId(ctx)] ?? (s.queued[userId(ctx)] = [])).push({ ...q, detectedAt: now() }); }); }
export async function takeQueued(ctx: Ctx) { return transaction((s) => { const q = s.queued[userId(ctx)] ?? []; s.queued[userId(ctx)] = []; return q; }); }
export async function incrementTrigger(ticker: string) { return transaction((s) => { s.metrics.triggers[ticker] = (s.metrics.triggers[ticker] ?? 0) + 1; }); }
