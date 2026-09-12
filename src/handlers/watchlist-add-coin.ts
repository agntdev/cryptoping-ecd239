import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { addTicker, data, itemKeyboard, symbol } from "../crypto.js";

registerMainMenuItem({ label: "Add coin", data: "watchlist:add_coin", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("watchlist:add_coin", async (ctx) => {
  await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "ticker" };
  await ctx.reply("Choose a coin, or tap Other ticker and send its symbol.", { reply_markup: inlineKeyboard([
    [inlineButton("Bitcoin BTC", "watchlist:seed:BTC"), inlineButton("Ethereum ETH", "watchlist:seed:ETH")],
    [inlineButton("Toncoin TON", "watchlist:seed:TON"), inlineButton("Other ticker", "watchlist:other")],
    [inlineButton("Back to menu", "menu:main")],
  ]) });
});
composer.callbackQuery("watchlist:other", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "ticker" }; await ctx.reply("Send the ticker symbol, for example SOL.", { reply_markup: { force_reply: true, input_field_placeholder: "Ticker symbol" } }); });
composer.callbackQuery(/^watchlist:seed:(BTC|ETH|TON)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const ticker = ctx.match[1];
  try { const added = await addTicker(ctx, ticker); if (!added) { await ctx.reply("That coin could not be verified right now. Try again shortly."); return; }
    await ctx.reply(`${added.name} (${ticker}) is on your watchlist. Choose an alert or check its price.`, { reply_markup: itemKeyboard(ticker) });
  } catch { data(ctx).errors++; await ctx.reply("Prices are unavailable right now. Try again shortly."); }
});
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.flow?.kind !== "ticker") return next();
  const ticker = symbol(ctx.message.text); if (!ticker) { await ctx.reply("Send a ticker using letters and numbers, for example SOL."); return; }
  try { const added = await addTicker(ctx, ticker); if (!added) { await ctx.reply("I couldn't verify that ticker. Check the spelling and try BTC, ETH, TON, SOL, ADA, DOGE, or XRP."); return; }
    ctx.session.flow = undefined; await ctx.reply(`${added.name} (${ticker}) is on your watchlist. Choose an alert or check its price.`, { reply_markup: itemKeyboard(ticker) });
  } catch { data(ctx).errors++; await ctx.reply("Prices are unavailable right now. Try again shortly."); }
});
export default composer;
