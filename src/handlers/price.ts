import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { data, showPrice, symbol } from "../crypto.js";
const composer = new Composer<Ctx>();
registerMainMenuItem({ label: "Check prices", data: "price:list", order: 30 });
async function one(ctx: Ctx, ticker: string) { try { const text = await showPrice(ctx, ticker); if (!text) { await ctx.reply("I couldn't find that ticker. Check the spelling and try again."); return; } await ctx.reply(text); } catch { data(ctx).errors++; await ctx.reply("Prices are unavailable right now. Try again shortly."); } }
composer.command("price", async (ctx) => { const arg = ctx.match?.trim(); if (arg) { const t = symbol(arg); if (!t) { await ctx.reply("Send a ticker after /price, for example /price BTC."); return; } await one(ctx, t); return; } const items = data(ctx).items; if (!items.length) { await ctx.reply("Your watchlist is empty — tap Add coin to start."); return; } for (const x of items) await one(ctx, x.ticker); });
composer.callbackQuery("price:list", async (ctx) => { await ctx.answerCallbackQuery(); const items = data(ctx).items; if (!items.length) { await ctx.reply("Your watchlist is empty — tap Add coin to start."); return; } await ctx.reply("Choose a coin to check.", { reply_markup: inlineKeyboard(items.map((x) => [inlineButton(x.ticker, `price:one:${x.ticker}`)])) }); });
composer.callbackQuery(/^price:one:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await one(ctx, ctx.match[1]); });
export default composer;
