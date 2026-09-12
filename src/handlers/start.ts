import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { touch } from "../store.js";
import { menuKeyboard } from "../storefront.js";
import { requireOwner } from "../toolkit/index.js";
import { orderDetail } from "./orders.js";
const composer = new Composer<Ctx>();
const WELCOME = "Добро пожаловать. Выберите раздел в меню ниже.";
async function showMenu(ctx: Ctx, edit: boolean) {
  await touch(ctx);
  if (edit) await ctx.editMessageText(WELCOME, { reply_markup: menuKeyboard() });
  else await ctx.reply(WELCOME, { reply_markup: menuKeyboard() });
}
composer.command("start", async (ctx) => {
  const payload = ctx.match.trim();
  if (payload.startsWith("admin_order_")) {
    if (!(await requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]))) return;
    await orderDetail(ctx, decodeURIComponent(payload.slice("admin_order_".length)));
    return;
  }
  await showMenu(ctx, false);
});
composer.command("menu", async (ctx) => showMenu(ctx, false));
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await showMenu(ctx, true); });
export default composer;
