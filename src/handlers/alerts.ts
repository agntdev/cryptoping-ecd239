import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { addAlert, data, item, itemKeyboard, now } from "../crypto.js";

const composer = new Composer<Ctx>();
const windows: Record<string, number> = { "15m": 15, "1h": 60, "4h": 240, "24h": 1440 };
composer.callbackQuery(/^alert:price:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "threshold", ticker: ctx.match[1] }; await ctx.reply(`Enter the target price in ${data(ctx).fiat}.`, { reply_markup: { force_reply: true, input_field_placeholder: "Target price" } }); });
composer.callbackQuery(/^alert:percent:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "percent", ticker: ctx.match[1] }; await ctx.reply("Choose a price change, or send a custom percent.", { reply_markup: inlineKeyboard([["1", "3", "5", "10"].map((p) => inlineButton(`${p}%`, `alert:pct:${p}`)), [inlineButton("Custom percent", "alert:pct:custom")]]) }); });
composer.callbackQuery(/^alert:pct:(1|3|5|10)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (ctx.session.flow?.kind !== "percent") return; ctx.session.flow.percent = Number(ctx.match[1]); await ctx.reply("Choose the comparison window.", { reply_markup: inlineKeyboard([["15m", "1h", "4h", "24h"].map((w) => inlineButton(w, `alert:window:${w}`))]) }); });
composer.callbackQuery("alert:pct:custom", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Send a percent between 0.1 and 100.", { reply_markup: { force_reply: true, input_field_placeholder: "Percent change" } }); });
composer.callbackQuery(/^alert:window:(15m|1h|4h|24h)$/, async (ctx) => { await ctx.answerCallbackQuery(); const f = ctx.session.flow; if (f?.kind !== "percent" || !f.percent) return; const baseline = item(ctx, f.ticker)?.lastPrice; addAlert(ctx, { ticker: f.ticker, type: "percent_change", percent: f.percent, windowMinutes: windows[ctx.match[1]], baseline }); ctx.session.flow = undefined; await ctx.reply(`${f.ticker} alert set for a ${f.percent}% move over ${ctx.match[1]}.`, { reply_markup: itemKeyboard(f.ticker) }); });
composer.callbackQuery(/^alert:direction:(above|below)$/, async (ctx) => { await ctx.answerCallbackQuery(); const f = ctx.session.flow; if (f?.kind !== "threshold" || !f.price) return; addAlert(ctx, { ticker: f.ticker, type: "price_threshold", price: f.price, direction: ctx.match[1] as "above" | "below" }); ctx.session.flow = undefined; await ctx.reply(`${f.ticker} price alert is set.`, { reply_markup: itemKeyboard(f.ticker) }); });
composer.callbackQuery(/^alert:toggle:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const alert = data(ctx).alerts.find((a) => a.id === ctx.match[1]); if (!alert) { await ctx.reply("That alert is no longer available."); return; } alert.armed = !alert.armed; await ctx.reply(`${alert.ticker} alert ${alert.armed ? "resumed" : "paused"}.`, { reply_markup: itemKeyboard(alert.ticker) }); });
composer.on("message:text", async (ctx, next) => {
  const f = ctx.session.flow;
  if (f?.kind === "threshold") { const p = Number(ctx.message.text.replace(/,/g, "")); if (!Number.isFinite(p) || p <= 0) { await ctx.reply("Enter a positive number for the target price."); return; } f.price = p; await ctx.reply(`Notify when ${f.ticker} is:`, { reply_markup: inlineKeyboard([[inlineButton("Above target", "alert:direction:above"), inlineButton("Below target", "alert:direction:below")]]) }); return; }
  if (f?.kind === "percent" && !f.percent) { const p = Number(ctx.message.text.replace("%", "")); if (!Number.isFinite(p) || p < .1 || p > 100) { await ctx.reply("Enter a percent from 0.1 to 100."); return; } f.percent = p; await ctx.reply("Choose the comparison window.", { reply_markup: inlineKeyboard([["15m", "1h", "4h", "24h"].map((w) => inlineButton(w, `alert:window:${w}`))]) }); return; }
  return next();
});

/** Called by a scheduler or significant-price-update webhook with a verified price. */
export async function evaluateAlerts(ctx: Ctx, ticker: string, latest: number): Promise<void> {
  const d = data(ctx); const watched = item(ctx, ticker); if (!watched) return; const old = watched.lastPrice ?? latest; watched.lastPrice = latest;
  for (const a of d.alerts.filter((x) => x.ticker === ticker)) {
    // A fired alert re-arms only after the price clears the threshold by the
    // user's hysteresis margin, preventing flapping around the trigger point.
    if (!a.armed) {
      const h = d.hysteresis / 100;
      const rearmed = a.type === "price_threshold"
        ? (a.direction === "above" ? latest <= (a.price ?? 0) * (1 - h) : latest >= (a.price ?? Infinity) * (1 + h))
        : Math.abs(((latest - old) / old) * 100) < (a.percent ?? Infinity) * (1 - h);
      if (rearmed) a.armed = true;
      continue;
    }
    const cooldown = d.cooldownHours * 3_600_000; if (a.lastTriggeredAt && now() - a.lastTriggeredAt < cooldown) continue;
    const change = old ? ((latest - old) / old) * 100 : 0;
    const hit = a.type === "price_threshold" ? (a.direction === "above" ? latest >= (a.price ?? Infinity) : latest <= (a.price ?? -Infinity)) : Math.abs(change) >= (a.percent ?? Infinity);
    if (!hit) continue;
    a.lastTriggeredAt = now(); a.armed = false;
    const note = `${ticker}: ${a.type === "price_threshold" ? "price threshold" : "percent-change"} alert`;
    if (inQuiet(d)) { if (d.digestEnabled) d.queued.push({ ticker, note, at: now() }); continue; }
    try { await ctx.reply(`${note}\n${old} → ${latest} (${change.toFixed(2)}%)\n${new Date(now()).toISOString()}`); } catch { /* blocked chats do not interrupt evaluation */ }
  }
}
function inQuiet(d: ReturnType<typeof data>) { const start = d.quietStart, end = d.quietEnd; if (!start || !end) return false; const parts = new Intl.DateTimeFormat("en-GB", { timeZone: d.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now())); const t = `${parts.find(x => x.type === "hour")?.value}:${parts.find(x => x.type === "minute")?.value}`; return start < end ? t >= start && t < end : t >= start || t < end; }
export default composer;
