import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { addItem, getProfile, renameItem } from "../store.js";
import { quote } from "../crypto.js";
import { force } from "../storefront.js";
import { formatPrice } from "../locale.js";

const composer = new Composer<Ctx>();
const seeds = inlineKeyboard([[inlineButton("Биткоин (BTC)", "coin:add:BTC"), inlineButton("Эфириум (ETH)", "coin:add:ETH")], [inlineButton("Тонкоин (TON)", "coin:add:TON"), inlineButton("Другая монета", "coin:other")], [inlineButton("В главное меню", "menu:main")]]);
function controls(id: string) { return inlineKeyboard([[inlineButton("Уведомление по цене", "alert:price:" + id), inlineButton("Уведомление по %", "alert:percent:" + id)], [inlineButton("Удалить", "coin:delete:" + id), inlineButton("Мой список", "watchlist:view")]]); }
async function add(ctx: Ctx, ticker: string) {
  const profile = await getProfile(ctx);
  const q = await quote(ticker, profile.fiat);
  if (!q) { await ctx.reply("Не удалось подтвердить этот тикер. Проверьте написание и попробуйте ещё раз.", { reply_markup: seeds }); return; }
  const result = await addItem(ctx, { ticker: q.ticker, name: q.name, lastPrice: q.price });
  await ctx.reply(result.existed ? q.ticker + " уже есть в вашем списке." : q.ticker + " добавлен по цене " + formatPrice(q.price, q.currency) + ".", { reply_markup: controls(result.item.id) });
}
composer.callbackQuery("watchlist:add_coin", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText("Выберите монету или введите другой тикер.", { reply_markup: seeds }); });
composer.callbackQuery(/^coin:add:(BTC|ETH|TON)$/, async (ctx) => { await ctx.answerCallbackQuery(); await add(ctx, ctx.match[1]); });
composer.callbackQuery("coin:other", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "add" }; await ctx.reply("Введите тикер, например SOL или ADA.", { reply_markup: force("Тикер") }); });
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (!flow) return next();
  const ticker = ctx.message.text.trim();
  if (flow.kind === "add") { ctx.session.flow = undefined; await add(ctx, ticker); return; }
  if (flow.kind === "edit") {
    const profile = await getProfile(ctx);
    const q = await quote(ticker, profile.fiat);
    if (!q) { await ctx.reply("Не удалось подтвердить этот тикер. Проверьте написание и попробуйте ещё раз."); return; }
    const changed = await renameItem(ctx, flow.itemId, q.ticker, q.name, q.price);
    ctx.session.flow = undefined;
    await ctx.reply(changed ? q.ticker + " обновлён по цене " + formatPrice(q.price, q.currency) + "." : "Этой монеты больше нет в вашем списке.", { reply_markup: inlineKeyboard([[inlineButton("Мой список", "watchlist:view")]]) });
    return;
  }
  return next();
});
export default composer;
