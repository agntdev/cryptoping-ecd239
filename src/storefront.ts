import { inlineButton, inlineKeyboard } from "./toolkit/index.js";

/** The persistent storefront home keyboard. Crypto features remain available
 * through their existing callbacks and commands, but are not promoted here. */
export const menuKeyboard = () => ({
  keyboard: [
    [{ text: "🛍 Каталог" }, { text: "🛒 Корзина" }],
    [{ text: "📦 Мои заказы" }, { text: "👤 Профиль" }],
    [{ text: "ℹ️ Помощь" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
});
export const back = inlineKeyboard([[inlineButton("В главное меню", "menu:main")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
