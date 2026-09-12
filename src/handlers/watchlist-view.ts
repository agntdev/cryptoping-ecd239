import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { data, deleteTicker, itemKeyboard, page } from "../crypto.js";

registerMainMenuItem({ label: "My list", data: "watchlist:view", order: 20 });
const composer = new Composer<Ctx>();
function markup(ctx: Ctx, at = 0) { const d = data(ctx); const items = page(ctx, at); const rows = items.flatMap((x) => [[inlineButton(`${x.ticker} alerts`, `watchlist:item:${x.ticker}`), inlineButton("Price", `price:one:${x.ticker}`)]]); if (at > 0) rows.push([inlineButton("Previous", `watchlist:page:${at - 1}`)]); if ((at + 1) * 5 < d.items.length) rows.push([inlineButton("Next", `watchlist:page:${at + 1}`)]); rows.push([inlineButton("Add coin", "watchlist:add_coin"), inlineButton("Back to menu", "menu:main")]); return inlineKeyboard(rows); }
function text(ctx: Ctx, at = 0) { const d = data(ctx); const items = page(ctx, at); return items.length ? `Your watchlist (${at + 1}/${Math.max(1, Math.ceil(d.items.length / 5))})\n${items.map((x) => `${x.ticker} — ${x.name}`).join("\n")}` : "No coins yet — tap Add coin to start your watchlist."; }
composer.callbackQuery("watchlist:view", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply(text(ctx), { reply_markup: markup(ctx) }); });
composer.callbackQuery(/^watchlist:page:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const p = Number(ctx.match[1]); await ctx.editMessageText(text(ctx, p), { reply_markup: markup(ctx, p) }); });
composer.callbackQuery(/^watchlist:item:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const t = ctx.match[1]; await ctx.editMessageText(`${t} controls`, { reply_markup: itemKeyboard(t) }); });
composer.callbackQuery(/^watchlist:edit:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const t = ctx.match[1]; const alerts = data(ctx).alerts.filter((a) => a.ticker === t); if (!alerts.length) { await ctx.editMessageText(`No alerts for ${t} yet — add one to start tracking it.`, { reply_markup: itemKeyboard(t) }); return; } const rows = alerts.map((a) => [inlineButton(a.armed ? "Pause alert" : "Resume alert", `alert:toggle:${a.id}`)]); rows.push([inlineButton("Back", `watchlist:item:${t}`)]); await ctx.editMessageText(`Edit ${t} alerts. Pause or resume each alert.`, { reply_markup: inlineKeyboard(rows) }); });
composer.callbackQuery(/^watchlist:delete:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const t = ctx.match[1]; deleteTicker(ctx, t); await ctx.editMessageText(`${t} was removed, along with its alerts.`, { reply_markup: inlineKeyboard([[inlineButton("My list", "watchlist:view"), inlineButton("Add coin", "watchlist:add_coin")]]) }); });
export default composer;
