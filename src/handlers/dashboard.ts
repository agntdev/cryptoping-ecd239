import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, requireOwner, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { snapshot, transaction } from "../store.js";
const composer = new Composer<Ctx>();
const gate = (ctx: Ctx) => requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);
async function dashboard(ctx: Ctx) {
  const state = await snapshot();
  const active = Object.values(state.users).filter((profile) => (state.items[profile.id] ?? []).length > 0).length;
  const top = Object.entries(state.metrics.triggers).sort((a, b) => b[1] - a[1]).slice(0, state.config.topN).map(([ticker, count]) => ticker + ": " + count).join("\n") || "Уведомлений пока не было.";
  const text = "Панель CryptoWatch\nАктивных пользователей: " + active + "\nТикеры с наибольшим числом срабатываний:\n" + top + "\nОшибок источника цен: " + state.metrics.errors;
  const target = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (!target) { await ctx.reply("Доступ владельца ещё не настроен."); return; }
  if (String(ctx.chat?.id) === target) await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Сбросить счётчики", "dashboard:reset"), inlineButton("Топ-5", "dashboard:top:5"), inlineButton("Топ-10", "dashboard:top:10")]]) });
  else await ctx.api.sendMessage(target, text);
}
composer.command("dashboard", async (ctx) => { if (!(await gate(ctx))) return; await dashboard(ctx); });
composer.callbackQuery("dashboard:reset", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await transaction((state) => { state.metrics.triggers = {}; state.metrics.errors = 0; }); await ctx.reply("Счётчики панели сброшены."); });
composer.callbackQuery(/^dashboard:top:(5|10|20|50|100)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await transaction((state) => { state.config.topN = Number(ctx.match[1]); }); await ctx.reply("Панель будет показывать топ-" + ctx.match[1] + " тикеров."); });
export default composer;
