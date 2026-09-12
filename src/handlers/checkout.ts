import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { cart } from "./storefront.js";
import { formatPrice } from "../locale.js";
import {
  createOrderFromCheckout,
  getCheckoutDraft,
  saveCheckoutDraft,
  clearCheckoutDraft,
  snapshot,
  userId,
  getCheckoutPricing,
  PAYMENT_METHODS,
  DELIVERY_METHODS,
  applyPromoCode,
  type PaymentMethod,
  type DeliveryMethod,
} from "../store.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const emptyCartText = "Корзина пуста. Откройте каталог, чтобы добавить товары.";

function stepPrompt(step: "name" | "phone" | "city" | "address") {
  const prompts = {
    name: "Введите полное имя получателя.",
    phone: "Введите номер телефона.",
    city: "Введите город доставки.",
    address: "Введите адрес доставки.",
  };
  const placeholders = {
    name: "Полное имя",
    phone: "Номер телефона",
    city: "Город",
    address: "Адрес доставки",
  };
  return { text: prompts[step], placeholder: placeholders[step] };
}

async function cartExists(ctx: Ctx) {
  const state = await snapshot();
  return (state.carts[userId(ctx)] ?? []).length > 0;
}

async function promptFor(ctx: Ctx, step: "name" | "phone" | "city" | "address", editing = false) {
  ctx.session.flow = { kind: "checkout", step, editing };
  const prompt = stepPrompt(step);
  await ctx.reply(prompt.text, { reply_markup: inlineKeyboard([[inlineButton("❌ Отменить", "checkout:cancel")]]) });
}

async function paymentPrompt(ctx: Ctx) {
  ctx.session.flow = { kind: "checkout", step: "payment" };
  await ctx.reply("Выберите способ оплаты.", { reply_markup: inlineKeyboard([
    [inlineButton(PAYMENT_METHODS.card, "checkout:payment:card")],
    [inlineButton(PAYMENT_METHODS.cash_on_delivery, "checkout:payment:cash_on_delivery")],
    [inlineButton("❌ Отменить", "checkout:cancel")],
  ]) });
}

async function deliveryPrompt(ctx: Ctx) {
  ctx.session.flow = { kind: "checkout", step: "delivery" };
  await ctx.reply("Выберите способ получения заказа.", { reply_markup: inlineKeyboard([
    [inlineButton(DELIVERY_METHODS.delivery_address, "checkout:delivery:delivery_address")],
    [inlineButton(DELIVERY_METHODS.pickup, "checkout:delivery:pickup")],
    [inlineButton("❌ Отменить", "checkout:cancel")],
  ]) });
}

async function summary(ctx: Ctx) {
  const state = await snapshot();
  const lines = state.carts[userId(ctx)] ?? [];
  const products = new Map(state.catalog.map((product) => [product.id, product]));
  if (!lines.length) return ctx.reply(emptyCartText);
  const details = lines.map((line) => {
    const product = products.get(line.productId);
    if (!product) return undefined;
    return `${product.name} — ${formatPrice(product.price, product.currency)} × ${line.quantity} = ${formatPrice(product.price * line.quantity, product.currency)}`;
  }).filter((line): line is string => Boolean(line));
  const first = lines.map((line) => products.get(line.productId)).find(Boolean);
  const pricing = await getCheckoutPricing(ctx);
  const draft = await saveCheckoutDraft(ctx, {
    itemsSubtotal: pricing.itemsSubtotal,
    appliedPromoCodeId: pricing.promo?.id,
    appliedDiscountPercent: pricing.promo?.discountPercent,
    discountAmount: pricing.discountAmount,
    finalTotal: pricing.finalTotal,
  });
  const currency = first?.currency ?? "RUB";
  const text = [
    "Проверьте заказ",
    ...details,
    `Стоимость товаров: ${formatPrice(pricing.itemsSubtotal, currency)}`,
    ...(pricing.promo ? [`Скидка по промокоду: -${pricing.discountPercent}% (-${formatPrice(pricing.discountAmount, currency)})`] : []),
    `Итого: ${formatPrice(pricing.finalTotal, currency)}`,
    "",
    `Имя: ${draft?.name ?? "—"}`,
    `Телефон: ${draft?.phone ?? "—"}`,
    `Город: ${draft?.city ?? "—"}`,
    `Адрес: ${draft?.address ?? "—"}`,
    `Способ получения: ${draft?.delivery_method?.label ?? "—"}`,
    `Способ оплаты: ${draft?.payment_method?.label ?? "—"}`,
  ].join("\n");
  ctx.session.flow = { kind: "checkout", step: "summary" };
  await ctx.reply(text, { reply_markup: inlineKeyboard([
    [inlineButton("🎟 Ввести промокод", "checkout:promo")],
    [inlineButton("✅ Подтвердить заказ", "checkout:confirm")],
    [inlineButton("✏️ Изменить данные", "checkout:edit")],
    [inlineButton("❌ Отменить", "checkout:cancel")],
  ]) });
}

async function promoPrompt(ctx: Ctx) {
  ctx.session.flow = { kind: "checkout", step: "promo" };
  await ctx.reply("Введите промокод.", { reply_markup: inlineKeyboard([[inlineButton("Отмена", "checkout:cancel")]]) });
}

async function begin(ctx: Ctx) {
  if (!(await cartExists(ctx))) return ctx.reply(emptyCartText);
  const draft = await getCheckoutDraft(ctx);
  if (draft?.name && draft.phone && draft.city && draft.address && draft.delivery_method && draft.payment_method) return summary(ctx);
  if (draft?.name && draft.phone && draft.city && draft.address && draft.delivery_method) return paymentPrompt(ctx);
  if (!draft?.name) return promptFor(ctx, "name");
  if (!draft.phone) return promptFor(ctx, "phone");
  if (!draft.city) return promptFor(ctx, "city");
  return promptFor(ctx, "address");
}

composer.callbackQuery("checkout:start", async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx); });

composer.callbackQuery("checkout:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Выберите данные для изменения.", { reply_markup: inlineKeyboard([
    [inlineButton("Имя", "checkout:edit:name"), inlineButton("Телефон", "checkout:edit:phone")],
    [inlineButton("Город", "checkout:edit:city"), inlineButton("Адрес", "checkout:edit:address")],
    [inlineButton("Способ получения", "checkout:edit:delivery")],
    [inlineButton("Способ оплаты", "checkout:edit:payment")],
    [inlineButton("🎟 Ввести промокод", "checkout:promo")],
    [inlineButton("❌ Отменить", "checkout:cancel")],
  ]) });
});

composer.callbackQuery("checkout:promo", async (ctx) => { await ctx.answerCallbackQuery(); await promoPrompt(ctx); });

composer.callbackQuery(/^checkout:edit:(name|phone|city|address)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await promptFor(ctx, ctx.match[1] as "name" | "phone" | "city" | "address", true);
});

composer.callbackQuery("checkout:edit:payment", async (ctx) => {
  await ctx.answerCallbackQuery();
  await paymentPrompt(ctx);
});

composer.callbackQuery("checkout:edit:delivery", async (ctx) => {
  await ctx.answerCallbackQuery();
  await deliveryPrompt(ctx);
});

composer.callbackQuery(/^checkout:delivery:(delivery_address|pickup)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  const draft = await getCheckoutDraft(ctx);
  if (!draft?.name || !draft.phone || !draft.city || !draft.address || !flow || flow.kind !== "checkout" || flow.step !== "delivery") {
    return begin(ctx);
  }
  const value = ctx.match[1] as "delivery_address" | "pickup";
  const delivery_method: DeliveryMethod = { value, label: DELIVERY_METHODS[value] };
  await saveCheckoutDraft(ctx, { delivery_method });
  await paymentPrompt(ctx);
});

composer.callbackQuery(/^checkout:payment:(card|cash_on_delivery)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  const draft = await getCheckoutDraft(ctx);
  if (!draft?.name || !draft.phone || !draft.city || !draft.address || !draft.delivery_method || !flow || flow.kind !== "checkout" || flow.step !== "payment") {
    return begin(ctx);
  }
  const value = ctx.match[1] as "card" | "cash_on_delivery";
  const payment_method: PaymentMethod = { value, label: PAYMENT_METHODS[value] };
  await saveCheckoutDraft(ctx, { payment_method });
  await summary(ctx);
});

composer.callbackQuery("checkout:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  await clearCheckoutDraft(ctx);
  ctx.session.flow = { kind: "cart" };
  await ctx.reply("Оформление отменено. Корзина сохранена.");
  await cart(ctx);
});

composer.callbackQuery("checkout:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = await getCheckoutDraft(ctx);
  if (!draft?.name || !draft.phone || !draft.city || !draft.address || !draft.delivery_method || !draft.payment_method) return begin(ctx);
  const order = await createOrderFromCheckout(ctx, { name: draft.name, phone: draft.phone, city: draft.city, address: draft.address }, draft.delivery_method, draft.payment_method);
  if (!order) return ctx.reply("Не удалось оформить заказ: один из товаров больше недоступен. Проверьте корзину.");
  ctx.session.flow = { kind: "cart" };
  const items = order.lines.map((line) => `${line.name} × ${line.quantity} — ${formatPrice(line.subtotal, order.currency)}`).join("\n");
  await ctx.reply(`Заказ ${order.id} создан.\n\n${items}\nСтоимость товаров: ${formatPrice(order.lines.reduce((sum, line) => sum + line.subtotal, 0), order.currency)}${order.appliedPromoCode ? `\nПромокод: ${order.appliedPromoCode}\nСкидка: -${order.appliedDiscountPercent}% (-${formatPrice(order.discountAmount ?? 0, order.currency)})` : ""}\nИтого: ${formatPrice(order.finalTotal ?? order.totalAmount, order.currency)}\n\nДоставка: ${order.customer.name}, ${order.customer.phone}, ${order.customer.city}, ${order.customer.address}\nСпособ получения: ${order.delivery_method.label}\nСпособ оплаты: ${order.payment_method.label}`);
});

composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (!flow || flow.kind !== "checkout" || flow.step === "summary") return next();
  const value = ctx.message.text.trim();
  if (!value) {
    await ctx.reply("Поле не может быть пустым.", { reply_markup: inlineKeyboard([[inlineButton("❌ Отменить", "checkout:cancel")]]) });
    return;
  }
  if (flow.step === "phone" && !/^[+()\-\s\d]{5,}$/.test(value)) {
    await ctx.reply("Введите номер телефона цифрами и распространёнными символами.", { reply_markup: inlineKeyboard([[inlineButton("❌ Отменить", "checkout:cancel")]]) });
    return;
  }
  if (flow.step === "payment") {
    await paymentPrompt(ctx);
    return;
  }
  if (flow.step === "promo") {
    const result = await applyPromoCode(ctx, value);
    if (result.status === "invalid") return ctx.reply("Промокод недействителен или отключён.");
    if (result.status === "already") return ctx.reply("Этот промокод уже применён к заказу.");
    const draft = result.draft;
    const percent = draft.appliedDiscountPercent ?? 0;
    const discount = draft.discountAmount ?? 0;
    const total = draft.finalTotal ?? 0;
    ctx.session.flow = { kind: "checkout", step: "summary" };
    await ctx.reply(`Промокод применён: -${percent}% (-${formatPrice(discount, "RUB")}): новый итог ${formatPrice(total, "RUB")}.`, { reply_markup: inlineKeyboard([[inlineButton("Продолжить оформление", "checkout:edit")]]) });
    return;
  }
  if (flow.step === "delivery") {
    await deliveryPrompt(ctx);
    return;
  }
  await saveCheckoutDraft(ctx, { [flow.step]: value });
  if (flow.editing) return summary(ctx);
  if (flow.step === "name") return promptFor(ctx, "phone");
  if (flow.step === "phone") return promptFor(ctx, "city");
  if (flow.step === "city") return promptFor(ctx, "address");
  return deliveryPrompt(ctx);
});

export default composer;
