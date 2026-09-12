import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { listCatalogCategories } from "../store.js";

const composer = new Composer<Ctx>();
const owner = (ctx: Ctx) => requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);

function panelMarkup() {
  return inlineKeyboard([
    [inlineButton("📦 Заказы", "admin:orders")],
    [inlineButton("🛍 Товары", "admin:products")],
    [inlineButton("📂 Категории", "admin:categories")],
    [inlineButton("🎟 Промокоды", "admin:promos")],
    [inlineButton("⬅️ Назад", "menu:main")],
  ]);
}

async function showPanel(ctx: Ctx, edit = false) {
  const text = "Админ-панель";
  if (edit) await ctx.editMessageText(text, { reply_markup: panelMarkup() });
  else await ctx.reply(text, { reply_markup: panelMarkup() });
}

composer.callbackQuery("admin:panel", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (await owner(ctx)) await showPanel(ctx, true);
});

composer.callbackQuery("admin:categories", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const categories = await listCatalogCategories();
  const text = categories.length ? "📂 Категории\n\n" + categories.map((category) => category.name).join("\n") : "📂 Категорий пока нет.";
  await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Назад", "admin:panel")]]) });
});

export default composer;
