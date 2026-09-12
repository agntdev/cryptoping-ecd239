import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { touch } from "../store.js";
import { menuKeyboard } from "../storefront.js";
const composer = new Composer<Ctx>();
const WELCOME = "Добро пожаловать в CryptoWatch. Следите за монетами конфиденциально и получайте понятные уведомления об изменении цен.";
composer.command("start", async (ctx) => { await touch(ctx); await ctx.reply(WELCOME, { reply_markup: menuKeyboard() }); });
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await touch(ctx); await ctx.editMessageText(WELCOME, { reply_markup: menuKeyboard() }); });
export default composer;
