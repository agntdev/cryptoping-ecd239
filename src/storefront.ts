import { inlineButton, inlineKeyboard, registerMainMenuItem } from "./toolkit/index.js";

/** All navigation is in-chat. No persistent reply keyboard is used. */
export const menuKeyboard = () => inlineKeyboard([
  [inlineButton("🛍 Каталог", "shop:catalog")],
  [inlineButton("🛒 Корзина", "shop:cart")],
  [inlineButton("Список наблюдения", "watchlist:view")],
  [inlineButton("Оповещения", "alerts:menu")],
  [inlineButton("Проверить цену", "price:menu")],
  [inlineButton("Настройки", "user:settings")],
]);
registerMainMenuItem({ label: "🛍 Каталог", data: "shop:catalog", order: 10 });
export const back = inlineKeyboard([[inlineButton("В главное меню", "menu:main")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
