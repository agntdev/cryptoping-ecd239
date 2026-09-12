import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { back } from "../storefront.js";
const composer = new Composer<Ctx>();
const HELP = "Выберите товар в каталоге и добавьте его в корзину. В корзине можно изменить количество и оформить заказ. Оплата доступна при получении или по счёту. По вопросам заказа напишите владельцу.";
composer.command("help", async (ctx) => { await ctx.reply(HELP, { reply_markup: back }); });
composer.callbackQuery("menu:help", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(HELP, { reply_markup: back }); });
export default composer;
