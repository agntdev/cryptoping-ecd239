import { inlineButton, inlineKeyboard } from "./toolkit/index.js";
export const menuKeyboard = () => inlineKeyboard([[inlineButton("Add coin", "watchlist:add_coin"), inlineButton("My list", "watchlist:view")], [inlineButton("Price check", "price:menu"), inlineButton("Settings", "user:settings")], [inlineButton("Help", "menu:help")]]);
export const back = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
export const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
