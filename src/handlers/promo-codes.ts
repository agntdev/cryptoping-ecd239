import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { requireOwner, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { createPromoCode, deletePromoCode, listPromoCodes, togglePromoCode, updatePromoCode, validatePromoDiscount } from "../store.js";
import { force } from "../storefront.js";

const composer = new Composer<Ctx>();
const owner = (ctx: Ctx) => requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);

function listMarkup() {
  return inlineKeyboard([
    [inlineButton("Создать промокод", "admin:promo:create")],
    [inlineButton("⬅️ К товарам", "admin:products")],
  ]);
}

async function showPromos(ctx: Ctx) {
  const promos = await listPromoCodes();
  const text = promos.length
    ? "🎟 Промокоды\n\n" + promos.map((promo) => `${promo.code} · ${promo.discountPercent}% · ${promo.active ? "активен" : "отключён"}`).join("\n")
    : "🎟 Промокоды\n\nПромокодов пока нет.";
  await ctx.reply(text, { reply_markup: inlineKeyboard([
    ...promos.map((promo) => [inlineButton(`${promo.code} · ${promo.active ? "выкл." : "вкл."}`, `admin:promo:toggle:${promo.id}`), inlineButton("Изменить", `admin:promo:edit:${promo.id}`), inlineButton("Удалить", `admin:promo:delete:${promo.id}`)]),
    [inlineButton("Создать промокод", "admin:promo:create")],
    [inlineButton("⬅️ К товарам", "admin:products")],
  ]) });
}

composer.callbackQuery("admin:promos", async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await showPromos(ctx); });
composer.callbackQuery("admin:promo:create", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; ctx.session.flow = { kind: "promo-create", step: "code" }; await ctx.reply("Введите код промокода.", { reply_markup: force("Например, SAVE10") }); });
composer.callbackQuery(/^admin:promo:toggle:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; await togglePromoCode(ctx.match[1]); await showPromos(ctx); });
composer.callbackQuery(/^admin:promo:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; await deletePromoCode(ctx.match[1]); await showPromos(ctx); });
composer.callbackQuery(/^admin:promo:edit:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const promo = (await listPromoCodes()).find((entry) => entry.id === ctx.match[1]); if (!promo) return ctx.reply("Промокод не найден."); ctx.session.flow = { kind: "promo-edit", id: promo.id, step: "code", code: promo.code, discount: promo.discountPercent }; await ctx.reply("Введите новый код промокода.", { reply_markup: force(promo.code) }); });

composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (!flow || (flow.kind !== "promo-create" && flow.kind !== "promo-edit")) return next();
  if (!(await owner(ctx))) return;
  const value = ctx.message.text.trim();
  if (flow.kind === "promo-create" && flow.step === "code") {
    if (!value || value.length > 40) return ctx.reply("Введите код длиной от 1 до 40 символов.");
    ctx.session.flow = { ...flow, step: "discount", code: value };
    return ctx.reply("Введите скидку от 0,01 до 100%.", { reply_markup: force("Например, 10") });
  }
  if (flow.kind === "promo-create") {
    const discount = Number(value.replace(",", "."));
    if (!validatePromoDiscount(discount)) return ctx.reply("Скидка должна быть числом больше 0 и не больше 100.");
    const saved = await createPromoCode(ctx, flow.code ?? "", discount);
    ctx.session.flow = undefined;
    if (!saved) return ctx.reply("Такой промокод уже существует или данные некорректны.");
    await ctx.reply("Промокод создан.");
    return showPromos(ctx);
  }
  if (flow.step === "code") {
    if (!value || value.length > 40) return ctx.reply("Введите код длиной от 1 до 40 символов.");
    ctx.session.flow = { ...flow, step: "discount", code: value };
    return ctx.reply("Введите новую скидку от 0,01 до 100%.", { reply_markup: force("Например, 10") });
  }
  const discount = Number(value.replace(",", "."));
  if (!validatePromoDiscount(discount)) return ctx.reply("Скидка должна быть числом больше 0 и не больше 100.");
  const saved = await updatePromoCode(flow.id, flow.code ?? "", discount);
  ctx.session.flow = undefined;
  if (!saved) return ctx.reply("Не удалось обновить промокод.");
  await ctx.reply("Промокод обновлён.");
  return showPromos(ctx);
});

export default composer;
