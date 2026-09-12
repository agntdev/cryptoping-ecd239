import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { touch } from "../store.js";
import { menuKeyboard } from "../storefront.js";
const composer = new Composer<Ctx>();
const WELCOME = "Добро пожаловать. Выберите раздел в меню ниже.";
async function showMenu(ctx: Ctx, edit: boolean) {
  await touch(ctx);
  if (edit) await ctx.editMessageText(WELCOME, { reply_markup: menuKeyboard() });
  else await ctx.reply(WELCOME, { reply_markup: menuKeyboard() });
}
composer.command("start", async (ctx) => showMenu(ctx, false));
composer.command("menu", async (ctx) => showMenu(ctx, false));
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await showMenu(ctx, true); });
export default composer;
