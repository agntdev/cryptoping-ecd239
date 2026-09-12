import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { addToCart, changeCart, clearCart, getUser, removeCart, snapshot } from "../store.js";
import { cartMarkup, cartText, menu } from "../storefront.js";
registerMainMenuItem({ label: "Корзина", data: "cart:open", order: 20 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx, edit = false) { const { rows, total } = await cartText(ctx); const text = rows.length ? `Ваша корзина\n\n${rows.map((x) => `${x.p.title} × ${x.quantity}\n${x.subtotal.toFixed(2)} ${x.p.currency}`).join("\n\n")}\n\nИтого: ${total.toFixed(2)} ${rows[0].p.currency}` : "Корзина пуста. Откройте каталог, чтобы выбрать товары."; const opts = { reply_markup: rows.length ? cartMarkup(rows) : menu() }; if (edit) await ctx.editMessageText(text, opts); else await ctx.reply(text, opts); }
composer.callbackQuery("cart:open", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^cart:add:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const result = await addToCart(ctx, ctx.match[1]); if (result === "missing") await ctx.reply("Товар не найден. Откройте каталог ещё раз."); else if (result === "stock") await ctx.reply("Недостаточно товара на складе."); else { await ctx.reply("Товар добавлен в корзину.", { reply_markup: cartMarkup((await cartText(ctx)).rows) }); } });
composer.callbackQuery(/^cart:(inc|dec):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await changeCart(ctx, ctx.match[2], ctx.match[1] === "inc" ? 1 : -1); await show(ctx, true); });
composer.callbackQuery(/^cart:remove:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await removeCart(ctx, ctx.match[1]); await show(ctx, true); });
composer.callbackQuery("cart:clear", async (ctx) => { await ctx.answerCallbackQuery(); await clearCart(ctx); await show(ctx, true); });
export default composer;
