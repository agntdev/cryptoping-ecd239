import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { back } from "../storefront.js";
const composer = new Composer<Ctx>();
const HELP = "CryptoWatch следит за вашим личным списком. Добавьте монету и выберите уведомление по цене или процентному изменению. Используйте /price BTC для текущей цены или /price для проверки списка. Уведомления учитывают тихие часы. Ваши данные конфиденциальны.";
composer.command("help", async (ctx) => { await ctx.reply(HELP, { reply_markup: back }); });
composer.callbackQuery("menu:help", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(HELP, { reply_markup: back }); });
export default composer;
