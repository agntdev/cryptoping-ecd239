import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, saveAlert, snapshot, userId, transaction, now, queueAlert, incrementTrigger, takeQueued } from "../store.js";
import { quote } from "../crypto.js";
import { force } from "../storefront.js";
const composer = new Composer<Ctx>();
function quietNow(profile: Awaited<ReturnType<typeof getProfile>>) {
  if (!profile.quietStart || !profile.quietEnd) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now()));
  const minute = Number(parts.find((x) => x.type === "hour")?.value) * 60 + Number(parts.find((x) => x.type === "minute")?.value);
  const parse = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const start = parse(profile.quietStart); const end = parse(profile.quietEnd);
  return start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
/** Poll one user's verified prices and deliver only newly eligible alerts. */
export async function evaluateUserAlerts(ctx: Ctx) {
  const profile = await getProfile(ctx); const state = await snapshot(); const items = state.items[userId(ctx)] ?? []; const alerts = state.alerts[userId(ctx)] ?? [];
  for (const item of items) {
    const current = await quote(item.ticker, profile.fiat); if (!current) continue;
    for (const alert of alerts.filter((a) => a.enabled && a.itemId === item.id)) {
      const old = alert.baseline ?? item.lastPrice; if (old === undefined) continue;
      const change = ((current.price - old) / old) * 100;
      const hit = alert.type === "threshold" ? alert.direction === "above" ? current.price >= (alert.price ?? Infinity) : current.price <= (alert.price ?? 0) : Math.abs(change) >= (alert.percent ?? Infinity);
      const cooled = !alert.lastTriggered || now() - alert.lastTriggered >= alert.cooldownHours * 3600000;
      if (!hit || !cooled) continue;
      const text = `${item.ticker} alert\nOld price: ${old} ${current.currency}\nNew price: ${current.price} ${current.currency}\nChange: ${change.toFixed(2)}%\nType: ${alert.type === "threshold" ? "price threshold" : `percent change over ${alert.window ?? "1h"}`}\nTime: ${new Date(now()).toISOString()}`;
      if (quietNow(profile)) { if (profile.morning) await queueAlert(ctx, { id: alert.id, itemId: item.id, ticker: item.ticker, note: text }); }
      else { try { await ctx.api.sendMessage(userId(ctx), text); await incrementTrigger(item.ticker); } catch { /* A blocked user must not stop other alerts. */ } }
      await transaction((s) => { const a = (s.alerts[userId(ctx)] ?? []).find((x) => x.id === alert.id); const i = (s.items[userId(ctx)] ?? []).find((x) => x.id === item.id); if (a) { a.lastTriggered = now(); if (a.type === "percent") a.baseline = current.price; } if (i) i.lastPrice = current.price; });
    }
  }
}
export async function sendMorningSummary(ctx: Ctx) { const queued = await takeQueued(ctx); if (!queued.length) return false; await ctx.reply(`Morning summary\n${queued.map((x) => `${x.ticker}: ${x.note}`).join("\n")}`); return true; }
function itemName(ctx: Ctx, id: string) { return (snapshot().then((s) => (s.items[userId(ctx)] ?? []).find((x) => x.id === id))); }
composer.callbackQuery(/^alert:price:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const item = await itemName(ctx, ctx.match[1]); if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; } ctx.session.flow = { kind: "price", itemId: item.id }; await ctx.reply(`Enter the target price for ${item.ticker}.`, { reply_markup: force("Target price") }); });
composer.on("message:text", async (ctx, next) => { const f = ctx.session.flow; if (!f || f.kind !== "price") return next(); const value = Number(ctx.message.text.trim().replace(",", ".")); if (!Number.isFinite(value) || value <= 0) { await ctx.reply("Enter a positive price, such as 65000."); return; } ctx.session.flow = { kind: "percent", itemId: f.itemId, percent: value }; await ctx.reply("Notify when the price moves above or below this target.", { reply_markup: inlineKeyboard([[inlineButton("Notify above", `alert:direction:above:${f.itemId}:${value}`), inlineButton("Notify below", `alert:direction:below:${f.itemId}:${value}`)]]) }); });
composer.callbackQuery(/^alert:direction:(above|below):([^:]+):([0-9.]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const item = await itemName(ctx, ctx.match[2]); if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; } const p = await getProfile(ctx); await saveAlert(ctx, { itemId: item.id, type: "threshold", price: Number(ctx.match[3]), direction: ctx.match[1] as "above" | "below", cooldownHours: p.cooldown }); await ctx.reply(`${item.ticker} price alert saved. Cooldown: ${p.cooldown} hours.`, { reply_markup: inlineKeyboard([[inlineButton("My list", "watchlist:view")]]) }); ctx.session.flow = undefined; });
composer.callbackQuery(/^alert:percent:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const item = await itemName(ctx, ctx.match[1]); if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; } ctx.session.flow = { kind: "percent", itemId: item.id }; await ctx.reply("Choose the percentage move.", { reply_markup: inlineKeyboard([[inlineButton("1%", `alert:percent-value:1:${item.id}`), inlineButton("3%", `alert:percent-value:3:${item.id}`)], [inlineButton("5%", `alert:percent-value:5:${item.id}`), inlineButton("10%", `alert:percent-value:10:${item.id}`)], [inlineButton("Custom", `alert:percent-custom:${item.id}`)]]) }); });
composer.callbackQuery(/^alert:percent-custom:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "percent", itemId: ctx.match[1] }; await ctx.reply("Enter a positive percentage.", { reply_markup: force("Percent") }); });
composer.callbackQuery(/^alert:percent-value:([0-9.]+):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "percent", itemId: ctx.match[2], percent: Number(ctx.match[1]) }; await windowPrompt(ctx); });
async function windowPrompt(ctx: Ctx) { await ctx.reply("Choose the time window.", { reply_markup: inlineKeyboard([[inlineButton("15 minutes", "alert:window:15m"), inlineButton("1 hour", "alert:window:1h")], [inlineButton("4 hours", "alert:window:4h"), inlineButton("24 hours", "alert:window:24h")]]) }); }
composer.callbackQuery(/^alert:window:(15m|1h|4h|24h)$/, async (ctx) => { await ctx.answerCallbackQuery(); const f = ctx.session.flow; if (!f || f.kind !== "percent" || !f.percent) { await ctx.reply("That alert flow expired. Start it again from My list."); return; } const item = await itemName(ctx, f.itemId); if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; } const s = await snapshot(); const baseline = item.lastPrice; await saveAlert(ctx, { itemId: item.id, type: "percent", percent: f.percent, window: ctx.match[1], baseline, cooldownHours: (await getProfile(ctx)).cooldown }); await ctx.reply(`${item.ticker} ${f.percent}% alert saved for ${ctx.match[1]}.`, { reply_markup: inlineKeyboard([[inlineButton("My list", "watchlist:view")]]) }); ctx.session.flow = undefined; void s; });
composer.on("message:text", async (ctx, next) => { const f = ctx.session.flow; if (!f || f.kind !== "percent" || f.percent !== undefined) return next(); const n = Number(ctx.message.text.trim().replace(",", ".")); if (!Number.isFinite(n) || n <= 0) { await ctx.reply("Enter a positive percentage."); return; } f.percent = n; await windowPrompt(ctx); });
export default composer;
