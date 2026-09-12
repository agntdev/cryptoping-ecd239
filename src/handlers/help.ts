import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { back } from "../storefront.js";
const composer = new Composer<Ctx>();
const HELP = "CryptoWatch monitors your private watchlist. Add a coin, then choose a price or percent alert. Use /price BTC for a current quote, or /price to check your list. Alerts respect your quiet hours. Your data stays private.";
composer.command("help", async (ctx) => { await ctx.reply(HELP, { reply_markup: back }); });
composer.callbackQuery("menu:help", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(HELP, { reply_markup: back }); });
export default composer;
