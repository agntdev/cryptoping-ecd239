import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { addToCart, clearCart, getProfile, snapshot, updateProfile, userId } from "../store.js";
import { formatPrice } from "../locale.js";
import { force, menuKeyboard } from "../storefront.js";

const composer = new Composer<Ctx>();

function homeMarkup() { return { reply_markup: menuKeyboard() }; }

async function catalog(ctx: Ctx) {
  const state = await snapshot();
  if (!state.catalog.length) {
    await ctx.reply("Каталог пока пуст. Товары появятся здесь позже.", homeMarkup());
    return;
  }
  const rows = state.catalog.map((product) => [inlineButton(product.name + " · " + formatPrice(product.price, product.currency), "shop:add:" + product.id)]);
  rows.push([inlineButton("В главное меню", "shop:home")]);
  await ctx.reply("Выберите товар.", { reply_markup: inlineKeyboard(rows) });
}

async function cart(ctx: Ctx) {
  const state = await snapshot();
  const lines = state.carts[userId(ctx)] ?? [];
  if (!lines.length) {
    await ctx.reply("Корзина пуста. Откройте каталог, чтобы добавить товары.", { ...homeMarkup(), reply_markup: menuKeyboard() });
    return;
  }
  const products = new Map(state.catalog.map((product) => [product.id, product]));
  const subtotals: Record<string, number> = {};
  const text = lines.map((line) => {
    const product = products.get(line.productId);
    if (!product) return undefined;
    subtotals[product.currency] = (subtotals[product.currency] ?? 0) + product.price * line.quantity;
    return product.name + " × " + line.quantity + " — " + formatPrice(product.price * line.quantity, product.currency);
  }).filter((line): line is string => Boolean(line));
  if (!text.length) {
    await ctx.reply("Корзина пуста. Откройте каталог, чтобы добавить товары.", homeMarkup());
    return;
  }
  const totals = Object.entries(subtotals).map(([currency, value]) => formatPrice(value, currency)).join(", ");
  await ctx.reply("Ваша корзина\n" + text.join("\n") + "\nИтого: " + totals, {
    reply_markup: inlineKeyboard([[inlineButton("Checkout", "shop:checkout"), inlineButton("Clear cart", "shop:clear")]]),
  });
}

async function profile(ctx: Ctx) {
  const p = await getProfile(ctx);
  await ctx.reply("Ваш профиль\nИмя: " + (p.name ?? "не указано") + "\nEmail: " + (p.email ?? "не указан") + "\nАдрес доставки: " + (p.address ?? "не указан") + "\nТелефон: " + (p.phone ?? "не указан") + "\nЧасовой пояс: " + p.timezone + "\nТихие часы: " + (p.quietStart && p.quietEnd ? p.quietStart + "–" + p.quietEnd : "выкл."), {
    reply_markup: inlineKeyboard([[inlineButton("Имя", "profile:field:name"), inlineButton("Email", "profile:field:email")], [inlineButton("Адрес доставки", "profile:field:address"), inlineButton("Телефон", "profile:field:phone")], [inlineButton("Save", "profile:save"), inlineButton("В главное меню", "shop:home")]]),
  });
}

async function orders(ctx: Ctx) {
  const state = await snapshot();
  const list = state.orders[userId(ctx)] ?? [];
  if (!list.length) { await ctx.reply("У вас нет заказов", homeMarkup()); return; }
  await ctx.reply("Ваши заказы\n" + list.map((order) => "Заказ " + order.id + " — " + formatPrice(order.subtotal, order.currency) + " — " + order.status).join("\n"), homeMarkup());
}

async function help(ctx: Ctx) {
  await ctx.reply("Выберите каталог, чтобы посмотреть товары. В корзине можно проверить состав заказа. В профиле сохраните контактные данные и адрес доставки. По вопросам обратитесь к владельцу магазина.", homeMarkup());
}

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text === "🛍 Каталог") return catalog(ctx);
  if (text === "🛒 Корзина") return cart(ctx);
  if (text === "📦 Мои заказы") return orders(ctx);
  if (text === "👤 Профиль") return profile(ctx);
  if (text === "ℹ️ Помощь") return help(ctx);
  const flow = ctx.session.flow;
  if (!flow || flow.kind !== "profile") return next();
  const value = text.trim();
  if (!value) { await ctx.reply("Введите значение, чтобы сохранить поле.", { reply_markup: force("Введите значение") }); return; }
  await updateProfile(ctx, { [flow.field]: value });
  ctx.session.flow = undefined;
  await ctx.reply("Поле сохранено.", { reply_markup: menuKeyboard() });
});

composer.callbackQuery("shop:catalog", async (ctx) => { await ctx.answerCallbackQuery(); await catalog(ctx); });
composer.callbackQuery("shop:cart", async (ctx) => { await ctx.answerCallbackQuery(); await cart(ctx); });
composer.callbackQuery("shop:orders", async (ctx) => { await ctx.answerCallbackQuery(); await orders(ctx); });
composer.callbackQuery("shop:profile", async (ctx) => { await ctx.answerCallbackQuery(); await profile(ctx); });
composer.callbackQuery("shop:help", async (ctx) => { await ctx.answerCallbackQuery(); await help(ctx); });
composer.callbackQuery("shop:home", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Выберите раздел в меню ниже.", homeMarkup()); });
composer.callbackQuery(/^shop:add:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const added = await addToCart(ctx, ctx.match[1]); await ctx.reply(added ? "Товар добавлен в корзину." : "Этот товар больше недоступен. Откройте каталог ещё раз.", homeMarkup()); });
composer.callbackQuery("shop:clear", async (ctx) => { await ctx.answerCallbackQuery(); await clearCart(ctx); await ctx.reply("Корзина очищена.", homeMarkup()); });
composer.callbackQuery("shop:checkout", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Оформление заказа пока недоступно. Владелец ещё не подключил оплату.", homeMarkup()); });
composer.callbackQuery(/^profile:field:(name|email|address|phone)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "profile", field: ctx.match[1] as "name" | "email" | "address" | "phone" }; await ctx.reply("Введите значение поля.", { reply_markup: force("Введите значение") }); });
composer.callbackQuery("profile:save", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Профиль сохранён.", homeMarkup()); });

export default composer;
