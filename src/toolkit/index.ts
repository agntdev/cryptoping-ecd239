// @agntdev/bot-toolkit — public API.
// Curated grammY SDK + inline-keyboard UI-kit + default session persistence.
export * from "./bot.js";
export {
  inlineButton,
  urlButton,
  menuKeyboard,
  confirmKeyboard,
  paginate,
  type InlineButton,
  type InlineKeyboardMarkup,
} from "./ui/keyboard.js";
export * from "./ui/menu.js";
export * from "./session/memory.js";
export * from "./session/redis.js";
export * from "./telemetry/reporter.js";
export * from "./owner.js";
export * from "./harness/index.js";

import {
  inlineButton as makeButton,
  inlineKeyboard as makeKeyboard,
  type InlineButton as KeyboardButton,
  type InlineKeyboardMarkup as KeyboardMarkup,
} from "./ui/keyboard.js";

/**
 * Application keyboards always retain a predictable escape hatch.  The
 * low-level UI builder stays deliberately general; this public toolkit entry
 * point is the bot-facing builder used by feature handlers.
 */
export function inlineKeyboard(rows: KeyboardButton[][]): KeyboardMarkup {
  const normalized = rows.map((row) => row.map((button) => {
    if ("callback_data" in button && (button.callback_data === "menu:main" || button.callback_data === "shop:home")) {
      return { ...button, text: "Главное меню" };
    }
    return button;
  }));
  const hasMainMenu = normalized.some((row) => row.some((button) =>
    "callback_data" in button && (button.callback_data === "menu:main" || button.callback_data === "shop:home"),
  ));
  if (!hasMainMenu) normalized.push([makeButton("Главное меню", "menu:main")]);
  const hasBack = normalized.some((row) => row.some((button) =>
    "callback_data" in button && button.callback_data === "nav:back",
  ));
  if (!hasBack) normalized.push([makeButton("⬅️ Назад", "nav:back")]);
  return makeKeyboard(normalized);
}
