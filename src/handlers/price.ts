import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, isOwner } from "../toolkit/index.js";
import { getUser, snapshot } from "../store.js";
import { ordersText } from "../storefront.js";
registerMainMenuItem({ label: "Заказы", data: "orders:mine", order: 30 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx) { const s = await snapshot(); const u = await getUser(ctx); await ctx.reply(ordersText(s, u.orderIds), { reply_markup: inlineKeyboard([[inlineButton("Каталог", "catalog:open"), inlineButton("Главное меню", "menu:main")]]) }); }
composer.command("orders", async (ctx) => { if (isOwner(ctx as unknown as Parameters<typeof isOwner>[0])) { const s = await snapshot(); await ctx.reply(s.orders.length ? `Заказы\n\n${s.orders.slice(-20).reverse().map((o) => `${o.id} · ${o.status} · ${o.total} ${o.currency}`).join("\n")}` : "Заказов пока нет."); } else await show(ctx); });
composer.callbackQuery("orders:mine", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^orders:view:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const s = await snapshot(); const o = s.orders.find((x) => x.id === ctx.match[1] && x.userId === String(ctx.from?.id ?? ctx.chat?.id)); if (!o) { await ctx.reply("Заказ не найден."); return; } await ctx.reply(`${o.id}\n${o.items.map((x) => `${x.title} × ${x.quantity}`).join("\n")}\nИтого: ${o.total} ${o.currency}\nСтатус: ${o.status}`, { reply_markup: inlineKeyboard([[inlineButton("Связаться с владельцем", "owner:contact")]]) }); });
composer.callbackQuery("owner:contact", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Напишите владельцу через Telegram, указанный в описании магазина."); });
export default composer;
