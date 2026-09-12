import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { getOrder, listOrders } from "../store.js";
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
      `${order.id} · ${formatPrice(order.totalAmount, order.currency)}`,
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
      `${order.id}\n${dateTime(order.createdAt)}\n${order.customer.name}\n${order.customer.phone}\n${order.customer.city}\n${order.customer.address}\nИтого: ${formatPrice(order.totalAmount, order.currency)}`,
      { reply_markup: inlineKeyboard([[inlineButton("Открыть заказ", `admin:order:view:${order.id}`)]]) },
    );
  }
}

async function orderDetail(ctx: Ctx, orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return ctx.reply("Заказ не найден.");
  const lines = order.lines.map((line) =>
    `${line.name}\n${formatPrice(line.unitPrice, order.currency)} × ${line.quantity} = ${formatPrice(line.subtotal, order.currency)}`,
  );
  const text = [
    `Заказ ${order.id}`,
    `Создан: ${dateTime(order.createdAt)}`,
    `Покупатель: ${order.customer.name}`,
    `Телефон: ${order.customer.phone}`,
    `Город: ${order.customer.city}`,
    `Адрес: ${order.customer.address}`,
    "",
    "Товары:",
    ...lines,
    "",
    `Итого: ${formatPrice(order.totalAmount, order.currency)}`,
  ].join("\n");
  await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("⬅️ К заказам", "admin:orders")]]) });
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

export default composer;
