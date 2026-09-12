import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { getOrder, listOrders, ORDER_STATUSES, ORDER_STATUS_NAMES, updateOrderStatus, type OrderStatus } from "../store.js";
import { formatPrice } from "../locale.js";

const composer = new Composer<Ctx>();
const PAGE_SIZE = 10;

async function owner(ctx: Ctx) {
  return requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);
}

function dateTime(value: number) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

async function ordersList(ctx: Ctx, page = 0) {
  const result = await listOrders(page, PAGE_SIZE);
  const text = result.total
    ? `📦 Заказы · страница ${result.page + 1} из ${result.pages}`
    : "📦 Заказов пока нет.";
  const rows: ReturnType<typeof inlineButton>[][] = [];
  for (const order of result.orders) {
    rows.push([inlineButton(
      `${order.id} · ${order.status} · ${formatPrice(order.totalAmount, order.currency)}`,
      `admin:order:view:${order.id}`,
    )]);
  }
  const navigation: ReturnType<typeof inlineButton>[] = [];
  if (result.page > 0) navigation.push(inlineButton("‹ Назад", `admin:orders:page:${result.page - 1}`));
  if (result.page < result.pages - 1) navigation.push(inlineButton("Вперёд ›", `admin:orders:page:${result.page + 1}`));
  if (navigation.length) rows.push(navigation);
  rows.push([inlineButton("⬅️ К товарам", "admin:products")]);
  await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
  for (const order of result.orders) {
    await ctx.reply(
      `${order.id}\n${order.status}\n${dateTime(order.createdAt)}\n${order.customer.name}\n${order.customer.phone}\n${order.customer.city}\n${order.customer.address}\n${order.delivery_method?.label ?? "🚚 Доставка по адресу"}\n${order.appliedPromoCode ? `Промокод: ${order.appliedPromoCode} (-${order.appliedDiscountPercent}%, ${formatPrice(order.discountAmount ?? 0, order.currency)})\n` : ""}Итого: ${formatPrice(order.finalTotal ?? order.totalAmount, order.currency)}`,
      { reply_markup: inlineKeyboard([[inlineButton("Открыть заказ", `admin:order:view:${order.id}`)]]) },
    );
  }
}

export async function orderDetail(ctx: Ctx, orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return ctx.reply("Заказ не найден.");
  const lines = order.lines.map((line) =>
    `${line.name}\n${formatPrice(line.unitPrice, order.currency)} × ${line.quantity} = ${formatPrice(line.subtotal, order.currency)}`,
  );
  const text = [
    `Заказ ${order.id}`,
    `Статус: ${order.status}`,
    `Создан: ${dateTime(order.createdAt)}`,
    `Покупатель: ${order.customer.name}`,
    `Телефон: ${order.customer.phone}`,
    `Город: ${order.customer.city}`,
    `Адрес: ${order.customer.address}`,
    `Способ получения: ${order.delivery_method?.label ?? "🚚 Доставка по адресу"}`,
    `Способ оплаты: ${order.payment_method?.label ?? "Не выбран"}`,
    "",
    "Товары:",
    ...lines,
    "",
    ...(order.appliedPromoCode ? [`Промокод: ${order.appliedPromoCode}`, `Скидка: ${order.appliedDiscountPercent}% · ${formatPrice(order.discountAmount ?? 0, order.currency)}`] : []),
    `Итого: ${formatPrice(order.finalTotal ?? order.totalAmount, order.currency)}`,
  ].join("\n");
  const statusButtons = ORDER_STATUSES.map((status) => [inlineButton(status, `admin:order:status:${order.id}:${ORDER_STATUSES.indexOf(status)}`)]);
  await ctx.reply(text, { reply_markup: inlineKeyboard([...statusButtons, [inlineButton("⬅️ К заказам", "admin:orders")]]) });
}

composer.callbackQuery("admin:orders", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await ordersList(ctx);
});

composer.callbackQuery(/^admin:orders:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await ordersList(ctx, Number(ctx.match[1]));
});

composer.callbackQuery(/^admin:order:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await orderDetail(ctx, ctx.match[1]);
});

composer.callbackQuery(/^admin:order:status:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const status = ORDER_STATUSES[Number(ctx.match[2])] as OrderStatus | undefined;
  if (!status) return ctx.reply("Не удалось изменить статус заказа.");
  const result = await updateOrderStatus(ctx.match[1], status);
  if (!result) return ctx.reply("Заказ не найден.");
  const { order } = result;
  // A buyer notification is part of the explicit status action only. Opening
  // the card never reaches this branch, and repeating the same status is quiet.
  if (result.changed) {
    try {
      await ctx.api.sendMessage(
        order.userId,
        `📦 Статус заказа №${order.id} изменён: ${ORDER_STATUS_NAMES[status]}`,
      );
    } catch {
      // A buyer may have blocked/deleted the bot. The admin action still succeeds.
    }
  }
  await ctx.reply(`Статус заказа обновлён: ${order.status}`, { reply_markup: inlineKeyboard([[inlineButton("Открыть заказ", `admin:order:view:${order.id}`)]]) });
});

export default composer;
