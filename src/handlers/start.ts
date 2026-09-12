import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { data } from "../crypto.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "Welcome to CryptoWatch. Track prices and private alerts from one menu.";

composer.command("start", async (ctx) => {
  const first = !ctx.session.data;
  data(ctx);
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
  if (first) await ctx.reply("Your timezone is UTC. You can change it in Settings for quiet hours and morning summaries.");
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
