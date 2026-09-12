import { inlineButton } from "./toolkit/index.js";
import { inlineKeyboard as rawInlineKeyboard } from "./toolkit/ui/keyboard.js";
type MenuContext = { env?: Record<string, unknown> | null; from?: { id: number }; chat?: { id: number } };

/** All navigation is in-chat. No persistent reply keyboard is used. */
export const menuKeyboard = (_ctx?: MenuContext) => rawInlineKeyboard([
  [inlineButton("🛍 Каталог", "shop:catalog")],
  [inlineButton("🛒 Корзина", "shop:cart")],
  [inlineButton("📦 Мои заказы", "shop:orders")],
  [inlineButton("👤 Профиль", "shop:profile")],
  [inlineButton("ℹ️ Помощь", "shop:help")],
]);
export const back = rawInlineKeyboard([[inlineButton("⬅️ Назад", "nav:back")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
