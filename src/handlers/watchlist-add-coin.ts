import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { catalogMarkup, catalogText, productText, productButtons } from "../storefront.js";
import { findProduct, snapshot } from "../store.js";
registerMainMenuItem({ label: "Каталог", data: "catalog:open", order: 10 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx, page = 0, edit = false) { const { products, pages } = await catalogText(page); const text = products.length ? `Каталог · страница ${page + 1}/${pages}` : "Каталог пока пуст. Загляните позже."; const opts = { reply_markup: catalogMarkup(products, page, pages) }; if (edit) await ctx.editMessageText(text, opts); else await ctx.reply(text, opts); }
composer.callbackQuery("catalog:open", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.command("catalog", async (ctx) => show(ctx));
composer.callbackQuery(/^catalog:page:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, Number(ctx.match[1]), true); });
composer.callbackQuery(/^product:view:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const p = findProduct(await snapshot(), ctx.match[1]); if (!p) { await ctx.reply("Товар не найден. Откройте каталог ещё раз."); return; } if (p.photo) await ctx.replyWithPhoto(p.photo, { caption: productText(p), reply_markup: productButtons(p) }); else await ctx.editMessageText(productText(p), { reply_markup: productButtons(p) }); });
composer.callbackQuery("catalog:categories", async (ctx) => { await ctx.answerCallbackQuery(); const s = await snapshot(); const categories = [...new Set(s.products.map((p) => p.category).filter(Boolean))] as string[]; await ctx.reply(categories.length ? "Категории:\n" + categories.join("\n") : "Категорий пока нет.", { reply_markup: inlineKeyboard([[inlineButton("Каталог", "catalog:open")]]) }); });
export default composer;
