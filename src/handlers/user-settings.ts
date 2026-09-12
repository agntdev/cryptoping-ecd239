import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, updateProfile } from "../store.js";
import { force } from "../storefront.js";
import { evaluateUserAlerts, sendMorningSummary } from "./alerts.js";
registerMainMenuItem({ label: "Настройки", data: "user:settings", order: 50 });
const composer = new Composer<Ctx>();
function keyboard() { return inlineKeyboard([[inlineButton("Часовой пояс", "settings:timezone"), inlineButton("Тихие часы", "settings:quiet")], [inlineButton("Утренний обзор", "settings:summary"), inlineButton("Пауза уведомлений", "settings:cooldown")], [inlineButton("Проверить уведомления", "alerts:check"), inlineButton("Отправить обзор", "summary:send")], [inlineButton("В главное меню", "menu:main")]]); }
composer.callbackQuery("user:settings", async (ctx) => { await ctx.answerCallbackQuery(); const p = await getProfile(ctx); await ctx.editMessageText("Настройки\nЧасовой пояс: " + p.timezone + "\nТихие часы: " + (p.quietStart && p.quietEnd ? p.quietStart + "–" + p.quietEnd : "выкл.") + "\nУтренний обзор: " + (p.morning ? p.summaryTime ?? "включён" : "выкл.") + "\nПауза уведомлений: " + p.cooldown + " ч.", { reply_markup: keyboard() }); });
composer.callbackQuery("settings:timezone", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "settings", step: "timezone" }; await ctx.reply("Введите часовой пояс IANA, например Europe/London.", { reply_markup: force("Часовой пояс") }); });
composer.callbackQuery("settings:quiet", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "settings", step: "quiet" }; await ctx.reply("Введите тихие часы в формате ЧЧ:ММ-ЧЧ:ММ или «выкл».", { reply_markup: force("22:00-07:00") }); });
composer.callbackQuery("settings:summary", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "settings", step: "summary" }; await ctx.reply("Введите время утреннего обзора в формате ЧЧ:ММ или «выкл».", { reply_markup: force("08:00") }); });
composer.callbackQuery("settings:cooldown", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "settings", step: "cooldown" }; await ctx.reply("Введите паузу уведомлений от 1 до 168 часов.", { reply_markup: force("6") }); });
composer.callbackQuery("alerts:check", async (ctx) => { await ctx.answerCallbackQuery(); await evaluateUserAlerts(ctx); await ctx.reply("Уведомления проверены.", { reply_markup: keyboard() }); });
composer.callbackQuery("summary:send", async (ctx) => { await ctx.answerCallbackQuery(); const sent = await sendMorningSummary(ctx); if (!sent) await ctx.reply("Нет уведомлений для утреннего обзора.", { reply_markup: keyboard() }); });
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow; if (!flow || flow.kind !== "settings") return next(); const value = ctx.message.text.trim();
  if (flow.step === "timezone") { try { new Intl.DateTimeFormat("ru-RU", { timeZone: value }); } catch { await ctx.reply("Не удалось найти этот часовой пояс. Используйте название IANA, например Europe/London."); return; } await updateProfile(ctx, { timezone: value }); }
  else if (flow.step === "quiet") { if (value.toLowerCase() === "выкл" || value.toLowerCase() === "off") await updateProfile(ctx, { quietStart: undefined, quietEnd: undefined }); else if (!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(value)) { await ctx.reply("Используйте формат ЧЧ:ММ-ЧЧ:ММ, например 22:00-07:00."); return; } else { const [quietStart, quietEnd] = value.split("-"); await updateProfile(ctx, { quietStart, quietEnd }); } }
  else if (flow.step === "summary") { if (value.toLowerCase() === "выкл" || value.toLowerCase() === "off") await updateProfile(ctx, { morning: false, summaryTime: undefined }); else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { await ctx.reply("Введите время, например 08:00, или «выкл»."); return; } else await updateProfile(ctx, { morning: true, summaryTime: value }); }
  else { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 168) { await ctx.reply("Введите целое число от 1 до 168."); return; } await updateProfile(ctx, { cooldown: number }); }
  ctx.session.flow = undefined; await ctx.reply("Настройки сохранены.", { reply_markup: keyboard() });
});
export default composer;
