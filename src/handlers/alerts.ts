import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, saveAlert, snapshot, userId, transaction, now, queueAlert, incrementTrigger, takeQueued } from "../store.js";
import { quote } from "../crypto.js";
import { force } from "../storefront.js";
import { formatDateTime, formatNumber, formatPrice } from "../locale.js";
const composer = new Composer<Ctx>();
function quietNow(profile: Awaited<ReturnType<typeof getProfile>>) {
  if (!profile.quietStart || !profile.quietEnd) return false;
  const parts = new Intl.DateTimeFormat("ru-RU", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now()));
  const minute = Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
  const parse = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = parse(profile.quietStart); const end = parse(profile.quietEnd);
  return start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
export async function evaluateUserAlerts(ctx: Ctx) {
  const profile = await getProfile(ctx); const state = await snapshot(); const items = state.items[userId(ctx)] ?? []; const alerts = state.alerts[userId(ctx)] ?? [];
  for (const item of items) {
    const current = await quote(item.ticker, profile.fiat); if (!current) continue;
    for (const alert of alerts.filter((entry) => entry.enabled && entry.itemId === item.id)) {
      const old = alert.baseline ?? item.lastPrice; if (old === undefined) continue;
      const change = ((current.price - old) / old) * 100;
      const hit = alert.type === "threshold" ? alert.direction === "above" ? current.price >= (alert.price ?? Infinity) : current.price <= (alert.price ?? 0) : Math.abs(change) >= (alert.percent ?? Infinity);
      const cooled = !alert.lastTriggered || now() - alert.lastTriggered >= alert.cooldownHours * 3600000;
      if (!hit || !cooled) continue;
      const text = item.ticker + " — уведомление\nСтарая цена: " + formatPrice(old, current.currency) + "\nНовая цена: " + formatPrice(current.price, current.currency) + "\nИзменение: " + formatNumber(change, 2) + "%\nТип: " + (alert.type === "threshold" ? "порог цены" : "изменение за " + (alert.window ?? "1h")) + "\nВремя: " + formatDateTime(now(), profile.timezone);
      if (quietNow(profile)) { if (profile.morning) await queueAlert(ctx, { id: alert.id, itemId: item.id, ticker: item.ticker, note: text }); }
      else { try { await ctx.api.sendMessage(userId(ctx), text); await incrementTrigger(item.ticker); } catch { /* A blocked user must not stop other alerts. */ } }
      await transaction((saved) => { const entry = (saved.alerts[userId(ctx)] ?? []).find((candidate) => candidate.id === alert.id); const savedItem = (saved.items[userId(ctx)] ?? []).find((candidate) => candidate.id === item.id); if (entry) { entry.lastTriggered = now(); if (entry.type === "percent") entry.baseline = current.price; } if (savedItem) savedItem.lastPrice = current.price; });
    }
  }
}
export async function sendMorningSummary(ctx: Ctx) { const queued = await takeQueued(ctx); if (!queued.length) return false; await ctx.reply("Утренний обзор\n" + queued.map((entry) => entry.ticker + ": " + entry.note).join("\n")); return true; }
function itemName(ctx: Ctx, id: string) { return snapshot().then((state) => (state.items[userId(ctx)] ?? []).find((item) => item.id === id)); }
composer.callbackQuery(/^alert:price:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const item = await itemName(ctx, ctx.match[1]); if (!item) { await ctx.reply("Этой монеты больше нет в вашем списке."); return; } ctx.session.flow = { kind: "price", itemId: item.id }; await ctx.reply("Введите целевую цену для " + item.ticker + ".", { reply_markup: force("Целевая цена") }); });
composer.on("message:text", async (ctx, next) => { const flow = ctx.session.flow; if (!flow || flow.kind !== "price") return next(); const value = Number(ctx.message.text.trim().replace(",", ".")); if (!Number.isFinite(value) || value <= 0) { await ctx.reply("Введите положительную цену, например 65000."); return; } ctx.session.flow = { kind: "percent", itemId: flow.itemId, percent: value }; await ctx.reply("Выберите, когда уведомлять: при превышении или снижении цены.", { reply_markup: inlineKeyboard([[inlineButton("Выше цели", "alert:direction:above:" + flow.itemId + ":" + value), inlineButton("Ниже цели", "alert:direction:below:" + flow.itemId + ":" + value)]]) }); });
composer.callbackQuery(/^alert:direction:(above|below):([^:]+):([0-9.]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const item = await itemName(ctx, ctx.match[2]); if (!item) { await ctx.reply("Этой монеты больше нет в вашем списке."); return; } const profile = await getProfile(ctx); await saveAlert(ctx, { itemId: item.id, type: "threshold", price: Number(ctx.match[3]), direction: ctx.match[1] as "above" | "below", cooldownHours: profile.cooldown }); await ctx.reply(item.ticker + " — уведомление по цене сохранено. Пауза: " + profile.cooldown + " ч.", { reply_markup: inlineKeyboard([[inlineButton("Мой список", "watchlist:view")]]) }); ctx.session.flow = undefined; });
composer.callbackQuery(/^alert:percent:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const item = await itemName(ctx, ctx.match[1]); if (!item) { await ctx.reply("Этой монеты больше нет в вашем списке."); return; } ctx.session.flow = { kind: "percent", itemId: item.id }; await ctx.reply("Выберите процент изменения.", { reply_markup: inlineKeyboard([[inlineButton("1%", "alert:percent-value:1:" + item.id), inlineButton("3%", "alert:percent-value:3:" + item.id)], [inlineButton("5%", "alert:percent-value:5:" + item.id), inlineButton("10%", "alert:percent-value:10:" + item.id)], [inlineButton("Свой процент", "alert:percent-custom:" + item.id)]]) }); });
composer.callbackQuery(/^alert:percent-custom:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "percent", itemId: ctx.match[1] }; await ctx.reply("Введите положительный процент.", { reply_markup: force("Процент") }); });
composer.callbackQuery(/^alert:percent-value:([0-9.]+):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "percent", itemId: ctx.match[2], percent: Number(ctx.match[1]) }; await windowPrompt(ctx); });
async function windowPrompt(ctx: Ctx) { await ctx.reply("Выберите временное окно.", { reply_markup: inlineKeyboard([[inlineButton("15 минут", "alert:window:15m"), inlineButton("1 час", "alert:window:1h")], [inlineButton("4 часа", "alert:window:4h"), inlineButton("24 часа", "alert:window:24h")]]) }); }
composer.callbackQuery(/^alert:window:(15m|1h|4h|24h)$/, async (ctx) => { await ctx.answerCallbackQuery(); const flow = ctx.session.flow; if (!flow || flow.kind !== "percent" || !flow.percent) { await ctx.reply("Срок действия этого сценария истёк. Начните снова из списка."); return; } const item = await itemName(ctx, flow.itemId); if (!item) { await ctx.reply("Этой монеты больше нет в вашем списке."); return; } await saveAlert(ctx, { itemId: item.id, type: "percent", percent: flow.percent, window: ctx.match[1], baseline: item.lastPrice, cooldownHours: (await getProfile(ctx)).cooldown }); await ctx.reply(item.ticker + " — уведомление на " + flow.percent + "% за " + ctx.match[1] + " сохранено.", { reply_markup: inlineKeyboard([[inlineButton("Мой список", "watchlist:view")]]) }); ctx.session.flow = undefined; });
composer.on("message:text", async (ctx, next) => { const flow = ctx.session.flow; if (!flow || flow.kind !== "percent" || flow.percent !== undefined) return next(); const value = Number(ctx.message.text.trim().replace(",", ".")); if (!Number.isFinite(value) || value <= 0) { await ctx.reply("Введите положительный процент."); return; } flow.percent = value; await windowPrompt(ctx); });
export default composer;
