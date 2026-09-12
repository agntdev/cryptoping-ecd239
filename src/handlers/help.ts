import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { back } from "../storefront.js";
import { showMenu as showPersistentMenu } from "../menu-state.js";
const composer = new Composer<Ctx>();
const HELP = "Выберите каталог, чтобы посмотреть товары. В корзине можно проверить состав заказа. В профиле сохраните контактные данные и адрес доставки. По вопросам обратитесь к владельцу магазина.";
composer.command("help", async (ctx) => { await ctx.reply(HELP, { reply_markup: back }); });
composer.callbackQuery("menu:help", async (ctx) => { await ctx.answerCallbackQuery(); await showPersistentMenu(ctx, { text: HELP, markup: back }); });
export default composer;
