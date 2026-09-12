import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getUser } from "../store.js";
import { menu } from "../storefront.js";
const composer = new Composer<Ctx>();
const WELCOME = "Добро пожаловать! Здесь можно выбрать товары и оформить заказ.";
composer.command("start", async (ctx) => { await getUser(ctx); await ctx.reply(WELCOME, { reply_markup: menu() }); });
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(WELCOME, { reply_markup: menu() }); });
export default composer;
