import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { snapshot, userId, removeItem } from "../store.js";
import { formatPrice } from "../locale.js";

registerMainMenuItem({ label: "Список наблюдения", data: "watchlist:view", order: 20 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx) {
  const state = await snapshot();
  const items = state.items[userId(ctx)] ?? [];
  const send = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  if (!items.length) { await send("Ваш список пуст. Нажмите «Добавить монету», чтобы начать.", { reply_markup: inlineKeyboard([[inlineButton("Добавить монету", "watchlist:add_coin")], [inlineButton("⬅️ Назад", "menu:main")]]) }); return; }
  const rows = items.map((item) => [inlineButton(item.ticker + (item.lastPrice ? " · " + formatPrice(item.lastPrice, "USD") : ""), "coin:item:" + item.id)]);
  rows.push([inlineButton("Добавить монету", "watchlist:add_coin")], [inlineButton("⬅️ Назад", "menu:main")]);
  await send("Ваш список монет", { reply_markup: inlineKeyboard(rows) });
}
composer.callbackQuery("watchlist:view", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^coin:item:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = await snapshot();
  const item = (state.items[userId(ctx)] ?? []).find((entry) => entry.id === ctx.match[1]);
  if (!item) { await ctx.reply("Этой монеты больше нет в вашем списке."); return; }
  await ctx.reply(item.ticker + (item.lastPrice ? " · " + formatPrice(item.lastPrice, "USD") : ""), { reply_markup: inlineKeyboard([[inlineButton("Уведомление по цене", "alert:price:" + item.id), inlineButton("Уведомление по %", "alert:percent:" + item.id)], [inlineButton("Изменить", "coin:edit:" + item.id), inlineButton("Удалить", "coin:delete:" + item.id)], [inlineButton("Назад к списку", "watchlist:view")]]) });
});
composer.callbackQuery(/^coin:edit:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "edit", itemId: ctx.match[1] }; await ctx.reply("Введите новый тикер.", { reply_markup: { force_reply: true, input_field_placeholder: "Тикер" } }); });
composer.callbackQuery(/^coin:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await removeItem(ctx, ctx.match[1]); await ctx.reply("Монета удалена из вашего списка.", { reply_markup: inlineKeyboard([[inlineButton("Мой список", "watchlist:view")]]) }); });
export default composer;
