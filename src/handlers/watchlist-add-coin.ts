import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { addItem, getProfile, renameItem } from "../store.js";
import { quote } from "../crypto.js";
import { force } from "../storefront.js";
registerMainMenuItem({ label: "Add coin", data: "watchlist:add_coin", order: 10 });
const composer = new Composer<Ctx>();
const seeds = inlineKeyboard([[inlineButton("Bitcoin (BTC)", "coin:add:BTC"), inlineButton("Ethereum (ETH)", "coin:add:ETH")], [inlineButton("Toncoin (TON)", "coin:add:TON"), inlineButton("Other ticker", "coin:other")], [inlineButton("Back to menu", "menu:main")]]);
function controls(id: string) { return inlineKeyboard([[inlineButton("Add price alert", `alert:price:${id}`), inlineButton("Add percent alert", `alert:percent:${id}`)], [inlineButton("Delete", `coin:delete:${id}`), inlineButton("My list", "watchlist:view")]]); }
async function add(ctx: Ctx, ticker: string) { const p = await getProfile(ctx); const q = await quote(ticker, p.fiat); if (!q) { await ctx.reply("I couldn't verify that ticker. Check the spelling and try again.", { reply_markup: seeds }); return; } const result = await addItem(ctx, { ticker: q.ticker, name: q.name, lastPrice: q.price }); await ctx.reply(result.existed ? `${q.ticker} is already on your watchlist.` : `${q.ticker} was added at ${q.price} ${q.currency}.`, { reply_markup: controls(result.item.id) }); }
composer.callbackQuery("watchlist:add_coin", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Choose a coin or enter another ticker.", { reply_markup: seeds }); });
composer.callbackQuery(/^coin:add:(BTC|ETH|TON)$/, async (ctx) => { await ctx.answerCallbackQuery(); await add(ctx, ctx.match[1]); });
composer.callbackQuery("coin:other", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "add" }; await ctx.reply("Enter a ticker such as SOL or ADA.", { reply_markup: force("Ticker symbol") }); });
composer.on("message:text", async (ctx, next) => { const flow = ctx.session.flow; if (!flow) return next(); const ticker = ctx.message.text.trim(); if (flow.kind === "add") { ctx.session.flow = undefined; await add(ctx, ticker); return; } if (flow.kind === "edit") { const p = await getProfile(ctx); const q = await quote(ticker, p.fiat); if (!q) { await ctx.reply("I couldn't verify that ticker. Check the spelling and try again."); return; } const changed = await renameItem(ctx, flow.itemId, q.ticker, q.name, q.price); ctx.session.flow = undefined; await ctx.reply(changed ? `${q.ticker} was updated at ${q.price} ${q.currency}.` : "That coin is no longer on your watchlist.", { reply_markup: inlineKeyboard([[inlineButton("My list", "watchlist:view")]]) }); return; } return next(); });
export default composer;
