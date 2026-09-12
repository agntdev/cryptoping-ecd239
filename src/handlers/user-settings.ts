import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { data, validTime } from "../crypto.js";
registerMainMenuItem({ label: "Settings", data: "user:settings", order: 40 });
const composer = new Composer<Ctx>();
function menu(ctx: Ctx) { const d = data(ctx); return inlineKeyboard([
  [inlineButton(`Timezone: ${d.timezone}`, "settings:timezone"), inlineButton(`Fiat: ${d.fiat}`, "settings:fiat")],
  [inlineButton("Quiet hours", "settings:quiet"), inlineButton(d.digestEnabled ? "Morning summary on" : "Morning summary off", "settings:digest")],
  [inlineButton(`Cooldown: ${d.cooldownHours}h`, "settings:cooldown")], [inlineButton("Back to menu", "menu:main")],
]); }
function text(ctx: Ctx) { const d = data(ctx); return `Settings\nTimezone: ${d.timezone}\nFiat: ${d.fiat}\nQuiet hours: ${d.quietStart && d.quietEnd ? `${d.quietStart}–${d.quietEnd}` : "off"}\nMorning summary: ${d.digestEnabled ? d.digestTime : "off"}\nAlert cooldown: ${d.cooldownHours} hours`; }
composer.callbackQuery("user:settings", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply(text(ctx), { reply_markup: menu(ctx) }); });
composer.callbackQuery("settings:timezone", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "timezone" }; await ctx.reply("Send an IANA timezone, for example Europe/London or America/New_York.", { reply_markup: { force_reply: true, input_field_placeholder: "Region/City" } }); });
composer.callbackQuery("settings:fiat", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Choose your display currency.", { reply_markup: inlineKeyboard([["USD", "EUR", "GBP"].map((x) => inlineButton(x, `settings:fiat:${x}`))]) }); });
composer.callbackQuery(/^settings:fiat:(USD|EUR|GBP)$/, async (ctx) => { await ctx.answerCallbackQuery(); data(ctx).fiat = ctx.match[1]; await ctx.reply(`Currency updated to ${ctx.match[1]}.`, { reply_markup: menu(ctx) }); });
composer.callbackQuery("settings:quiet", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "quiet-start" }; await ctx.reply("Send quiet hours start as HH:MM, or send off to disable quiet hours.", { reply_markup: { force_reply: true, input_field_placeholder: "22:00" } }); });
composer.callbackQuery("settings:digest", async (ctx) => { await ctx.answerCallbackQuery(); const d = data(ctx); d.digestEnabled = !d.digestEnabled; if (d.digestEnabled) { ctx.session.flow = { kind: "digest-time" }; await ctx.reply("Send your morning summary time as HH:MM.", { reply_markup: { force_reply: true, input_field_placeholder: "08:00" } }); } else await ctx.reply("Morning summary is off.", { reply_markup: menu(ctx) }); });
composer.callbackQuery("settings:cooldown", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "cooldown" }; await ctx.reply("Send an alert cooldown in hours from 1 to 168.", { reply_markup: { force_reply: true, input_field_placeholder: "6" } }); });
composer.on("message:text", async (ctx, next) => { const f = ctx.session.flow; const d = data(ctx); const value = ctx.message.text.trim();
  if (f?.kind === "timezone") { try { Intl.DateTimeFormat(undefined, { timeZone: value }); d.timezone = value; ctx.session.flow = undefined; await ctx.reply(`Timezone updated to ${value}.`, { reply_markup: menu(ctx) }); } catch { await ctx.reply("That timezone is not recognised. Try a name like Europe/London."); } return; }
  if (f?.kind === "quiet-start") { if (value.toLowerCase() === "off") { d.quietStart = d.quietEnd = undefined; ctx.session.flow = undefined; await ctx.reply("Quiet hours are off.", { reply_markup: menu(ctx) }); return; } if (!validTime(value)) { await ctx.reply("Use a 24-hour time like 22:00."); return; } ctx.session.flow = { kind: "quiet-end" }; d.quietStart = value; await ctx.reply("Now send quiet hours end as HH:MM.", { reply_markup: { force_reply: true, input_field_placeholder: "07:00" } }); return; }
  if (f?.kind === "quiet-end" || f?.kind === "digest-time") { if (!validTime(value)) { await ctx.reply("Use a 24-hour time like 08:00."); return; } if (f.kind === "quiet-end") { d.quietEnd = value; await ctx.reply(`Quiet hours set for ${d.quietStart}–${value}.`, { reply_markup: menu(ctx) }); } else { d.digestTime = value; await ctx.reply(`Morning summary is set for ${value}.`, { reply_markup: menu(ctx) }); } ctx.session.flow = undefined; return; }
  if (f?.kind === "cooldown") { const hours = Number(value); if (!Number.isInteger(hours) || hours < 1 || hours > 168) { await ctx.reply("Send a whole number from 1 to 168."); return; } d.cooldownHours = hours; ctx.session.flow = undefined; await ctx.reply(`Alert cooldown updated to ${hours} hours.`, { reply_markup: menu(ctx) }); return; }
  return next();
});
export default composer;
