import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, requireOwner, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { snapshot, transaction } from "../store.js";
const composer = new Composer<Ctx>();
const gate = (ctx: Ctx) => requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);
async function dashboard(ctx: Ctx) { const s = await snapshot(); const active = Object.values(s.users).filter((p) => (s.items[p.id] ?? []).length > 0).length; const top = Object.entries(s.metrics.triggers).sort((a, b) => b[1] - a[1]).slice(0, s.config.topN).map(([ticker, count]) => `${ticker}: ${count}`).join("\n") || "No alerts have triggered yet."; const text = `CryptoWatch dashboard\nActive users: ${active}\nTop triggered tickers:\n${top}\nRecent price-source errors: ${s.metrics.errors}`; const target = adminChatId(ctx as unknown as { env?: Record<string, unknown> }); if (!target) { await ctx.reply("Owner access isn't set up yet."); return; } if (String(ctx.chat?.id) === target) await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Reset counters", "dashboard:reset"), inlineButton("Top 5", "dashboard:top:5"), inlineButton("Top 10", "dashboard:top:10")]]) }); else await ctx.api.sendMessage(target, text); }
composer.command("dashboard", async (ctx) => { if (!(await gate(ctx))) return; await dashboard(ctx); });
composer.callbackQuery("dashboard:reset", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await transaction((s) => { s.metrics.triggers = {}; s.metrics.errors = 0; }); await ctx.reply("Dashboard counters reset."); });
composer.callbackQuery(/^dashboard:top:(5|10|20|50|100)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await transaction((s) => { s.config.topN = Number(ctx.match[1]); }); await ctx.reply(`Dashboard will show the top ${ctx.match[1]} tickers.`); });
export default composer;
