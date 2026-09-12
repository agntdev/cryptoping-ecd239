import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { addToCart, changeCartQuantity, clearCart, getCatalogCategory, getCatalogProduct, getProfile, getUserOrder, listCatalogCategories, listCatalogProducts, listUserOrders, removeFromCart, snapshot, updateProfile, userId } from "../store.js";
import { formatPrice } from "../locale.js";
import { force, menuKeyboard } from "../storefront.js";
import { showMenu as showPersistentMenu } from "../menu-state.js";

const composer = new Composer<Ctx>();

function homeMarkup(ctx: Ctx) { return { reply_markup: menuKeyboard(ctx) }; }

async function catalog(ctx: Ctx) {
  ctx.session.flow = { kind: "catalog" };
  const categories = await listCatalogCategories();
  const rows = categories.map((category) => [inlineButton(category.name, "catalog:category:" + category.id)]);
  rows.push([inlineButton("⬅️ Назад", "menu:main")]);
  await showPersistentMenu(ctx, { text: "Выберите категорию товаров", markup: inlineKeyboard(rows) });
}

async function category(ctx: Ctx, categoryId: string) {
  const selected = await getCatalogCategory(categoryId);
  if (!selected) {
    await catalog(ctx);
    return;
  }
  ctx.session.flow = { kind: "category", categoryId: selected.id };
  await productList(ctx, selected.id);
}

function productPrice(product: { price: number; currency: string }) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: product.currency }).format(product.price);
}

async function productList(ctx: Ctx, categoryId: string) {
  const selected = await getCatalogCategory(categoryId);
  if (!selected) return catalog(ctx);
  const products = await listCatalogProducts(categoryId);
  const rows = [[inlineButton("⬅️ Назад", "catalog:back:" + categoryId)]];
  await showPersistentMenu(ctx, { text: products.length ? "Товары в категории «" + selected.name + "»" : "В этой категории пока нет товаров.", markup: inlineKeyboard(rows) });
  for (const product of products) {
    const caption = product.name + "\n" + productPrice(product) + "\n" + (product.availability === "in_stock" ? "В наличии" : "Нет в наличии");
    if (product.photo) await ctx.replyWithPhoto(product.photo, { caption, reply_markup: inlineKeyboard([[inlineButton(product.name, "catalog:product:view:" + product.id)]]) });
    else await ctx.reply(caption, { reply_markup: inlineKeyboard([[inlineButton(product.name, "catalog:product:view:" + product.id)]]) });
  }
}

async function productDetail(ctx: Ctx, productId: string) {
  const product = await getCatalogProduct(productId);
  if (!product) return ctx.reply("Товар больше недоступен.");
  const caption = (product.photo ? "" : "Фото: нет\n\n") + product.name + "\n\n" + product.description + "\n\nЦена: " + productPrice(product) + "\nСтатус: " + (product.availability === "in_stock" ? "В наличии" : "Нет в наличии");
  const controls = inlineKeyboard([
    [inlineButton("🛒 Добавить в корзину", "catalog:cart:add:" + product.id)],
    [inlineButton("🛒 Открыть корзину", "shop:cart:from:" + product.id)],
    [inlineButton("⬅️ Назад", "catalog:products:" + product.categoryId)],
  ]);
  if (product.photo) await ctx.replyWithPhoto(product.photo, { caption, reply_markup: controls });
  else await ctx.reply(caption, { reply_markup: controls });
}

export async function cart(ctx: Ctx) {
  const state = await snapshot();
  const lines = state.carts[userId(ctx)] ?? [];
  if (!lines.length) {
    await showPersistentMenu(ctx, { text: "Корзина пуста. Откройте каталог, чтобы добавить товары.", markup: menuKeyboard(ctx) });
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
  if (!lines.length) {
    await showPersistentMenu(ctx, { text: "Корзина пуста. Откройте каталог, чтобы добавить товары.", markup: menuKeyboard(ctx) });
    return;
  }
  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product) {
      await ctx.reply("Товар больше недоступен\nКоличество: " + line.quantity, { reply_markup: inlineKeyboard([[inlineButton("➕ Увеличить количество", "cart:inc:" + line.productId)], [inlineButton("➖ Уменьшить количество", "cart:dec:" + line.productId)], [inlineButton("🗑 Удалить товар", "cart:remove:" + line.productId)]]) });
      continue;
    }
    const warning = line.unitPrice !== undefined && line.unitPrice !== product.price ? "\nЦена обновлена" : "";
    const caption = product.name + "\nЦена за единицу: " + formatPrice(product.price, product.currency) + "\nКоличество: " + line.quantity + "\nПодытог: " + formatPrice(product.price * line.quantity, product.currency) + warning;
    const controls = inlineKeyboard([[inlineButton("➕ Увеличить количество", "cart:inc:" + line.productId)], [inlineButton("➖ Уменьшить количество", "cart:dec:" + line.productId)], [inlineButton("🗑 Удалить товар", "cart:remove:" + line.productId)]]);
    if (product.photo) await ctx.replyWithPhoto(product.photo, { caption, reply_markup: controls });
    else await ctx.reply(caption, { reply_markup: controls });
  }
  const totals = Object.entries(subtotals).map(([currency, value]) => formatPrice(value, currency)).join(", ");
  await showPersistentMenu(ctx, { text: "Итого: " + (totals || "нет доступных товаров"), markup: inlineKeyboard([[inlineButton("Оформить заказ", "checkout:start")], [inlineButton("⬅️ Назад", "cart:back")]]) });
}

async function profile(ctx: Ctx) {
  const p = await getProfile(ctx);
  const draft = ctx.session.flow?.kind === "profile" ? ctx.session.flow.draft : {};
  if (ctx.session.flow?.kind !== "profile") {
    ctx.session.flow = { kind: "profile", draft: { name: p.name, phone: p.phone, city: p.city, address: p.address } };
  }
  const value = (field: "name" | "phone" | "city" | "address") => draft[field] ?? p[field] ?? "не указано";
  await showPersistentMenu(ctx, { text: "Профиль\n\nимя: " + value("name") + "\nтелефон: " + value("phone") + "\nгород: " + value("city") + "\nадрес: " + value("address"), markup: inlineKeyboard([
      [inlineButton("Имя", "profile:field:name"), inlineButton("Телефон", "profile:field:phone")],
      [inlineButton("Город", "profile:field:city"), inlineButton("Адрес", "profile:field:address")],
      [inlineButton("Сохранить", "profile:save"), inlineButton("📦 Мои заказы", "shop:orders")],
      [inlineButton("В главное меню", "shop:home")],
    ]) });
}

async function orders(ctx: Ctx) {
  const list = await listUserOrders(ctx);
  if (!list.length) { await showPersistentMenu(ctx, { text: "У вас пока нет заказов.", markup: inlineKeyboard([[inlineButton("В профиль", "shop:profile")], [inlineButton("В главное меню", "shop:home")]]) }); return; }
  const rows = list.map((order) => [inlineButton("Заказ " + order.id + " · " + formatPrice(order.totalAmount, order.currency), "profile:order:" + order.id)]);
  rows.push([inlineButton("В профиль", "shop:profile")], [inlineButton("В главное меню", "shop:home")]);
  await showPersistentMenu(ctx, { text: "📦 Мои заказы", markup: inlineKeyboard(rows) });
}

async function orderDetail(ctx: Ctx, orderId: string) {
  const order = await getUserOrder(ctx, orderId);
  if (!order) { await ctx.reply("Этот заказ недоступен.", { reply_markup: inlineKeyboard([[inlineButton("📦 Мои заказы", "shop:orders")]]) }); return; }
  const lines = order.lines.map((line) => `${line.name} × ${line.quantity} — ${formatPrice(line.subtotal, order.currency)}`).join("\n");
  await ctx.reply("Заказ " + order.id + "\nСтатус: " + order.status + "\n\nТовары:\n" + lines + "\n\nИтого: " + formatPrice(order.totalAmount, order.currency) + "\nСпособ получения: " + order.delivery_method.label + "\nСпособ оплаты: " + order.payment_method.label, {
    reply_markup: inlineKeyboard([[inlineButton("📦 Мои заказы", "shop:orders")], [inlineButton("В профиль", "shop:profile")]]),
  });
}

async function help(ctx: Ctx) {
  await showPersistentMenu(ctx, { text: "Выберите каталог, чтобы посмотреть товары. В корзине можно проверить состав заказа. В профиле сохраните контактные данные и адрес доставки. По вопросам обратитесь к владельцу магазина.", markup: menuKeyboard(ctx) });
}

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text === "🛍 Каталог") return catalog(ctx);
  const flow = ctx.session.flow;
  if (text === "⬅️ Назад") {
    if (flow?.kind === "category") return catalog(ctx);
    ctx.session.flow = undefined;
    return ctx.reply("Добро пожаловать. Выберите раздел в меню ниже.", homeMarkup(ctx));
  }
  if (flow?.kind === "catalog") {
    const selected = (await listCatalogCategories()).find((entry) => entry.name === text);
    if (selected) return category(ctx, selected.id);
  }
  if (text === "🛒 Корзина") return cart(ctx);
  if (text === "📦 Мои заказы") return orders(ctx);
  if (text === "👤 Профиль") return profile(ctx);
  if (text === "ℹ️ Помощь") return help(ctx);
  const profileFlow = ctx.session.flow;
  if (!profileFlow || profileFlow.kind !== "profile" || !profileFlow.field) return next();
  const value = text.trim();
  if (!value) { await ctx.reply("Введите значение, чтобы сохранить поле.", { reply_markup: force("Введите значение") }); return; }
  ctx.session.flow = { kind: "profile", field: undefined, draft: { ...profileFlow.draft, [profileFlow.field]: value } };
  await ctx.reply("Изменения готовы. Нажмите «Сохранить».", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", "profile:save")], [inlineButton("👤 Профиль", "shop:profile")]]) });
});

composer.callbackQuery("shop:catalog", async (ctx) => { await ctx.answerCallbackQuery(); await catalog(ctx); });
composer.callbackQuery("shop:cart", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "cart" }; await cart(ctx); });
composer.callbackQuery(/^shop:cart:from:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const product = await getCatalogProduct(ctx.match[1]); ctx.session.flow = { kind: "cart", returnProductId: product?.id, returnCategoryId: product?.categoryId }; await cart(ctx); });
composer.callbackQuery("shop:orders", async (ctx) => { await ctx.answerCallbackQuery(); await orders(ctx); });
composer.callbackQuery("shop:profile", async (ctx) => { await ctx.answerCallbackQuery(); await profile(ctx); });
composer.callbackQuery(/^profile:order:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await orderDetail(ctx, ctx.match[1]); });
composer.callbackQuery("shop:help", async (ctx) => { await ctx.answerCallbackQuery(); await help(ctx); });
composer.callbackQuery("shop:home", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = undefined; await showPersistentMenu(ctx, { text: "Выберите раздел в меню ниже.", markup: menuKeyboard(ctx) }, { replace: true }); });
composer.callbackQuery(/^shop:add:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const added = await addToCart(ctx, ctx.match[1]); await ctx.reply(added ? "Товар добавлен в корзину." : "Этот товар больше недоступен. Откройте каталог ещё раз.", homeMarkup(ctx)); });
composer.callbackQuery(/^catalog:cart:add:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const product = await getCatalogProduct(ctx.match[1]); const added = await addToCart(ctx, ctx.match[1]); await ctx.reply(added ? "Товар добавлен в корзину." : "Этот товар больше недоступен. Откройте каталог ещё раз.", { reply_markup: inlineKeyboard([[inlineButton("🛒 Открыть корзину", "shop:cart:from:" + (product?.id ?? ""))], [inlineButton("⬅️ Назад", "catalog:products:" + (product?.categoryId ?? ""))]]) }); });
composer.callbackQuery(/^cart:(inc|dec|remove):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const action = ctx.match[1]; const productId = ctx.match[2]; if (action === "remove") await removeFromCart(ctx, productId); else await changeCartQuantity(ctx, productId, action === "inc" ? 1 : -1); await cart(ctx); });
composer.callbackQuery("cart:back", async (ctx) => { await ctx.answerCallbackQuery(); const flow = ctx.session.flow; if (flow?.kind === "cart" && flow.returnProductId) return productDetail(ctx, flow.returnProductId); if (flow?.kind === "cart" && flow.returnCategoryId) return productList(ctx, flow.returnCategoryId); await catalog(ctx); });
composer.callbackQuery("shop:clear", async (ctx) => { await ctx.answerCallbackQuery(); await clearCart(ctx); await ctx.reply("Корзина очищена.", homeMarkup(ctx)); });
composer.callbackQuery(/^catalog:product:view:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await productDetail(ctx, ctx.match[1]); });
composer.callbackQuery(/^catalog:back:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await catalog(ctx); });
composer.callbackQuery(/^catalog:category:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await category(ctx, ctx.match[1]); });
composer.callbackQuery(/^catalog:products:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await productList(ctx, ctx.match[1]); });
composer.callbackQuery(/^profile:field:(name|phone|city|address)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await getProfile(ctx);
  const field = ctx.match[1] as "name" | "phone" | "city" | "address";
  const previous = ctx.session.flow?.kind === "profile" ? ctx.session.flow.draft : {};
  ctx.session.flow = { kind: "profile", field, draft: { name: previous.name ?? p.name, phone: previous.phone ?? p.phone, city: previous.city ?? p.city, address: previous.address ?? p.address } };
  await ctx.reply("Введите новое значение для поля «" + field + "».", { reply_markup: force("Введите значение") });
});
composer.callbackQuery("profile:save", async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  const draft = flow?.kind === "profile" ? flow.draft : {};
  if (!draft.name?.trim()) return ctx.reply("Укажите имя перед сохранением профиля.");
  if (draft.phone && !/^\+?[0-9 ()-]{7,20}$/.test(draft.phone) || (draft.phone && draft.phone.replace(/\D/g, "").length < 7)) return ctx.reply("Укажите телефон в понятном формате, например +7 900 123-45-67.");
  await updateProfile(ctx, { name: draft.name.trim(), phone: draft.phone?.trim(), city: draft.city?.trim(), address: draft.address?.trim() });
  ctx.session.flow = undefined;
  await ctx.reply("Профиль сохранён.", { reply_markup: inlineKeyboard([[inlineButton("👤 Профиль", "shop:profile")], [inlineButton("В главное меню", "shop:home")]]) });
});

export default composer;
