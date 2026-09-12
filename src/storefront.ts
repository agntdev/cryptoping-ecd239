import { inlineButton, inlineKeyboard } from "./toolkit/index.js";
export const menuKeyboard = () => inlineKeyboard([[inlineButton("Добавить монету", "watchlist:add_coin"), inlineButton("Мой список", "watchlist:view")], [inlineButton("Проверить цену", "price:menu"), inlineButton("Настройки", "user:settings")], [inlineButton("Помощь", "menu:help")]]);
export const back = inlineKeyboard([[inlineButton("В главное меню", "menu:main")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
