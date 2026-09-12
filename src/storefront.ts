import { inlineButton, inlineKeyboard, registerMainMenuItem, isOwner } from "./toolkit/index.js";
type MenuContext = { env?: Record<string, unknown> | null; from?: { id: number }; chat?: { id: number } };

/** All navigation is in-chat. No persistent reply keyboard is used. */
export const menuKeyboard = (ctx?: MenuContext) => inlineKeyboard([
  [inlineButton("Добавить монету", "watchlist:add_coin"), inlineButton("Мой список", "watchlist:view")],
  [inlineButton("Проверить цену", "price:menu"), inlineButton("Настройки", "user:settings")],
  [inlineButton("🛍 Каталог", "shop:catalog")],
  [inlineButton("🛒 Корзина", "shop:cart")],
  [inlineButton("📦 Мои заказы", "shop:orders")],
  [inlineButton("👤 Профиль", "shop:profile")],
  [inlineButton("ℹ️ Помощь", "shop:help")],
  ...(ctx && isOwner(ctx) ? [[inlineButton("⚙️ Админ-панель", "admin:panel")]] : []),
]);
registerMainMenuItem({ label: "🛍 Каталог", data: "shop:catalog", order: 10 });
export const back = inlineKeyboard([[inlineButton("В главное меню", "menu:main")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
