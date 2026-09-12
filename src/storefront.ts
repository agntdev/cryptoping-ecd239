import { inlineButton, inlineKeyboard, registerMainMenuItem, isOwner } from "./toolkit/index.js";
type MenuContext = { env?: Record<string, unknown> | null; from?: { id: number }; chat?: { id: number } };

/** All navigation is in-chat. No persistent reply keyboard is used. */
export const menuKeyboard = (ctx?: MenuContext) => inlineKeyboard([
  [inlineButton("Каталог", "shop:catalog"), inlineButton("Избранное", "shop:favorites")],
  [inlineButton("Поиск", "shop:search"), inlineButton("Контакты", "shop:contact")],
  [inlineButton("🛒 Корзина", "shop:cart"), inlineButton("📦 Мои заказы", "shop:orders")],
  [inlineButton("👤 Профиль", "shop:profile"), inlineButton("Помощь", "shop:help")],
  ...(ctx && isOwner(ctx) ? [[inlineButton("⚙️ Админ-панель", "admin:panel")]] : []),
  [inlineButton("Главное меню", "menu:main")],
]);
registerMainMenuItem({ label: "Каталог", data: "shop:catalog", order: 10 });
registerMainMenuItem({ label: "Избранное", data: "shop:favorites", order: 20 });
registerMainMenuItem({ label: "Поиск", data: "shop:search", order: 30 });
registerMainMenuItem({ label: "Контакты", data: "shop:contact", order: 40 });
export const back = inlineKeyboard([[inlineButton("Назад", "nav:back"), inlineButton("В главное меню", "menu:main")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
