import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
const composer = new Composer<Ctx>();
composer.callbackQuery("user:settings", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Настройки профиля доступны в разделе «Профиль».", { reply_markup: inlineKeyboard([[inlineButton("Профиль", "shop:profile")], [inlineButton("⬅️ Назад", "nav:back")]]) }); });
export default composer;
