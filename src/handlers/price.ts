import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, snapshot, userId, transaction, now } from "../store.js";
import { quote } from "../crypto.js";
registerMainMenuItem({ label: "Price check", data: "price:menu", order: 30 });
const composer = new Composer<Ctx>();
async function check(ctx: Ctx, ticker?: string) { const p = await getProfile(ctx); const s = await snapshot(); const symbols = ticker ? [ticker.toUpperCase()] : (s.items[userId(ctx)] ?? []).map((x) => x.ticker); if (!symbols.length) { await ctx.reply("Your watchlist is empty. Tap Add coin to begin."); return; } const lines: string[] = []; for (const symbol of symbols) { const q = await quote(symbol, p.fiat); if (q) { lines.push(`${q.ticker}: ${q.price} ${q.currency}`); await transaction((state) => { const item = (state.items[userId(ctx)] ?? []).find((x) => x.ticker === q.ticker); if (item) item.lastPrice = q.price; }); } } if (!lines.length) { await transaction((state) => { state.metrics.errors += 1; }); await ctx.reply("I couldn't reach the price source. Try again shortly."); return; } await ctx.reply(`Current prices\n${lines.join("\n")}\nSource: CoinGecko · ${new Date(now()).toISOString()}`); }
composer.command("price", async (ctx) => { await check(ctx, ctx.match.trim() || undefined); });
composer.callbackQuery("price:menu", async (ctx) => { await ctx.answerCallbackQuery(); await check(ctx); });
export default composer;
