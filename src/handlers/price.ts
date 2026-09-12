import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { getProfile, snapshot, userId, transaction, now } from "../store.js";
import { quote } from "../crypto.js";
import { formatDateTime, formatPrice } from "../locale.js";

registerMainMenuItem({ label: "Проверить цену", data: "price:menu", order: 30 });
const composer = new Composer<Ctx>();

async function check(ctx: Ctx, ticker?: string) {
  const profile = await getProfile(ctx);
  const state = await snapshot();
  const symbols = ticker ? [ticker.toUpperCase()] : (state.items[userId(ctx)] ?? []).map((item) => item.ticker);
  if (!symbols.length) {
    await ctx.reply("Ваш список пуст. Нажмите «Добавить монету», чтобы начать.");
    return;
  }
  const lines: string[] = [];
  for (const symbol of symbols) {
    const q = await quote(symbol, profile.fiat);
    if (q) {
      lines.push(q.ticker + ": " + formatPrice(q.price, q.currency));
      await transaction((saved) => {
        const item = (saved.items[userId(ctx)] ?? []).find((entry) => entry.ticker === q.ticker);
        if (item) item.lastPrice = q.price;
      });
    }
  }
  if (!lines.length) {
    await transaction((saved) => { saved.metrics.errors += 1; });
    await ctx.reply("Не удалось получить данные о цене. Попробуйте ещё раз позже.");
    return;
  }
  await ctx.reply("Текущие цены\n" + lines.join("\n") + "\nИсточник: CoinGecko · " + formatDateTime(now(), profile.timezone));
}

composer.command("price", async (ctx) => { await check(ctx, ctx.match.trim() || undefined); });
composer.callbackQuery("price:menu", async (ctx) => { await ctx.answerCallbackQuery(); await check(ctx); });
export default composer;
