import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { snapshot, userId, removeItem } from "../store.js";
registerMainMenuItem({ label: "My list", data: "watchlist:view", order: 20 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx) { const s = await snapshot(); const items = s.items[userId(ctx)] ?? []; if (!items.length) { await ctx.reply("Your watchlist is empty. Tap Add coin to begin.", { reply_markup: inlineKeyboard([[inlineButton("Add coin", "watchlist:add_coin"), inlineButton("Back to menu", "menu:main")]]) }); return; } const rows = items.map((x) => [inlineButton(`${x.ticker}${x.lastPrice ? ` · ${x.lastPrice} USD` : ""}`, `coin:item:${x.id}`)]); rows.push([inlineButton("Add coin", "watchlist:add_coin"), inlineButton("Back to menu", "menu:main")]); await ctx.reply("Your watchlist", { reply_markup: inlineKeyboard(rows) }); }
composer.callbackQuery("watchlist:view", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^coin:item:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const s = await snapshot(); const item = (s.items[userId(ctx)] ?? []).find((x) => x.id === ctx.match[1]); if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; } await ctx.reply(`${item.ticker}${item.lastPrice ? ` · ${item.lastPrice} USD` : ""}`, { reply_markup: inlineKeyboard([[inlineButton("Add price alert", `alert:price:${item.id}`), inlineButton("Add percent alert", `alert:percent:${item.id}`)], [inlineButton("Edit", `coin:edit:${item.id}`), inlineButton("Delete", `coin:delete:${item.id}`)], [inlineButton("Back to list", "watchlist:view")]]) }); });
composer.callbackQuery(/^coin:edit:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "edit", itemId: ctx.match[1] }; await ctx.reply("Enter the replacement ticker.", { reply_markup: { force_reply: true, input_field_placeholder: "Ticker symbol" } }); });
composer.callbackQuery(/^coin:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await removeItem(ctx, ctx.match[1]); await ctx.reply("The coin was removed from your watchlist.", { reply_markup: inlineKeyboard([[inlineButton("My list", "watchlist:view")]]) }); });
export default composer;
