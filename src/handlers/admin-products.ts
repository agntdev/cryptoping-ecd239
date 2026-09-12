import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { force } from "../storefront.js";
import {
  createCatalogProduct,
  deleteCatalogProduct,
  getCatalogCategory,
  getCatalogProduct,
  listCatalogCategories,
  listCatalogProducts,
  snapshot,
  updateCatalogProduct,
} from "../store.js";
import type { CatalogProduct, Flow } from "../store.js";

const composer = new Composer<Ctx>();
const PAGE_SIZE = 6;
const detailButtons = (id: string) => inlineKeyboard([
  [inlineButton("✏️ Изменить", "admin:product:edit:" + id)],
  [inlineButton("🗑 Удалить", "admin:product:delete:" + id)],
  [inlineButton("⬅️ Назад", "admin:products")],
]);

async function owner(ctx: Ctx) {
  return requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);
}

function availability(product: CatalogProduct) {
  return product.availability === "in_stock" ? "В наличии" : "Нет в наличии";
}

function money(product: CatalogProduct) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: product.currency }).format(product.price);
}

function stamp(value: number) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(value) : "не указано";
}

async function productAdminList(ctx: Ctx, page = 0, edit = false) {
  const state = await snapshot();
  const products = state.catalog;
  const pages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const visible = products.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const text = products.length ? `Товары · страница ${current + 1} из ${pages}` : "Товары пока не добавлены.";
  const nav = [] as ReturnType<typeof inlineButton>[][];
  if (current > 0) nav.push([inlineButton("‹ Назад", `admin:products:page:${current - 1}`)]);
  if (current < pages - 1) nav.push([inlineButton("Вперёд ›", `admin:products:page:${current + 1}`)]);
  nav.push([inlineButton("Создать товар", "admin:product:create")]);
  if (edit && ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(nav) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(nav) });
  for (const product of visible) {
    const caption = `${product.name}\n${money(product)} · ${availability(product)}\nКатегория: ${state.categories.find((c) => c.id === product.categoryId)?.name ?? "не указана"}`;
    if (product.photo) await ctx.replyWithPhoto(product.photo, { caption, reply_markup: inlineKeyboard([[inlineButton(product.name, "admin:product:view:" + product.id)]]) });
    else await ctx.reply(caption, { reply_markup: inlineKeyboard([[inlineButton(product.name, "admin:product:view:" + product.id)]]) });
  }
}

async function productDetail(ctx: Ctx, productId: string) {
  const product = await getCatalogProduct(productId);
  if (!product) return ctx.reply("Товар больше недоступен.");
  const category = await getCatalogCategory(product.categoryId);
  const text = `${product.name}\n\n${product.description}\n\nЦена: ${money(product)}\nНаличие: ${availability(product)}\nКатегория: ${category?.name ?? "не указана"}\nСоздан: ${stamp(product.createdAt)}\nИзменён: ${stamp(product.updatedAt)}`;
  if (product.photo) await ctx.replyWithPhoto(product.photo, { caption: text, reply_markup: detailButtons(product.id) });
  else await ctx.reply(text, { reply_markup: detailButtons(product.id) });
}

async function chooseCategory(ctx: Ctx, callback: string) {
  const categories = await listCatalogCategories();
  await ctx.reply("Выберите категорию товара.", { reply_markup: inlineKeyboard(categories.map((category) => [inlineButton(category.name, callback + category.id)])) });
}

async function startCreate(ctx: Ctx, categoryId: string) {
  if (!(await getCatalogCategory(categoryId))) return ctx.reply("Категория больше недоступна.");
  ctx.session.flow = { kind: "product-create", categoryId, step: "name" };
  await ctx.reply("Введите название товара", { reply_markup: force("Название товара") });
}

async function startEdit(ctx: Ctx, productId: string) {
  const product = await getCatalogProduct(productId);
  if (!product) return ctx.reply("Товар больше недоступен.");
  ctx.session.flow = { kind: "product-edit", productId, categoryId: product.categoryId, step: "field", name: product.name, photo: product.photo, description: product.description, price: product.price, availability: product.availability, stockCount: product.stockCount };
  await ctx.reply("Выберите поле для изменения.", { reply_markup: inlineKeyboard([
    [inlineButton("Название", "admin:product:field:name:" + productId), inlineButton("Фото", "admin:product:field:photo:" + productId)],
    [inlineButton("Описание", "admin:product:field:description:" + productId), inlineButton("Цена", "admin:product:field:price:" + productId)],
    [inlineButton("Наличие", "admin:product:field:availability:" + productId), inlineButton("Категория", "admin:product:field:category:" + productId)],
    [inlineButton("Сохранить", "admin:product:save-edit:" + productId), inlineButton("Отмена", "admin:product:view:" + productId)],
  ]) });
}

async function saveEdit(ctx: Ctx, flow: Extract<NonNullable<Flow>, { kind: "product-edit" }>) {
  if (!flow.name?.trim() || !flow.description?.trim() || flow.price === undefined || !Number.isFinite(flow.price) || flow.price < 0 || !flow.categoryId || !flow.availability) return ctx.reply("Заполните название, описание, цену, наличие и категорию.");
  const product = await updateCatalogProduct(flow.productId, { categoryId: flow.categoryId, name: flow.name.trim(), photo: flow.photo, description: flow.description.trim(), price: flow.price, availability: flow.availability, stockCount: flow.stockCount });
  ctx.session.flow = undefined;
  if (!product) return ctx.reply("Товар больше недоступен.");
  await ctx.reply("Изменения сохранены.");
  await productDetail(ctx, product.id);
}

async function startField(ctx: Ctx, field: NonNullable<Extract<NonNullable<Flow>, { kind: "product-edit" }>["field"]>) {
  const flow = ctx.session.flow;
  if (!flow || flow.kind !== "product-edit") return ctx.reply("Форма товара устарела. Начните редактирование снова.");
  if (field === "category") {
    await chooseCategory(ctx, "admin:product:set-category:" + flow.productId + ":");
    return;
  }
  if (field === "availability") {
    await availabilityChoice(ctx, "admin:product:set-availability:" + flow.productId + ":");
    return;
  }
  ctx.session.flow = { ...flow, step: "field", field };
  if (field === "photo") return ctx.reply("Загрузите новое фото или выберите действие.", { reply_markup: inlineKeyboard([[inlineButton("Удалить фото", "admin:product:remove-photo:" + flow.productId), inlineButton("Отмена", "admin:product:edit:" + flow.productId)]]) });
  const labels: Record<"name" | "description" | "price", string> = { name: "новое название", description: "новое описание", price: "новую цену" };
  if (field !== "name" && field !== "description" && field !== "price") return ctx.reply("Выберите поле для изменения.");
  await ctx.reply(`Введите ${labels[field]}.`, { reply_markup: force(field === "price" ? "Цена" : field === "name" ? "Название" : "Описание") });
}

async function saveCreate(ctx: Ctx, flow: Extract<NonNullable<Flow>, { kind: "product-create" }>) {
  if (!flow.name?.trim() || !flow.photo || !flow.description?.trim() || flow.price === undefined || !Number.isFinite(flow.price) || flow.price < 0 || !flow.availability) return ctx.reply("Заполните все поля товара.");
  const product = await createCatalogProduct({ categoryId: flow.categoryId, name: flow.name.trim(), photo: flow.photo, description: flow.description.trim(), price: flow.price, currency: "RUB", availability: flow.availability, stockCount: flow.stockCount });
  ctx.session.flow = undefined;
  await ctx.reply("Товар сохранён.");
  await productDetail(ctx, product.id);
}

async function availabilityChoice(ctx: Ctx, prefix: string) {
  await ctx.reply("Выберите наличие товара.", { reply_markup: inlineKeyboard([[inlineButton("В наличии", prefix + "in_stock"), inlineButton("Нет в наличии", prefix + "out_of_stock")]]) });
}

composer.command("admin_products", async (ctx) => { if (await owner(ctx)) await productAdminList(ctx); });
composer.callbackQuery("admin:products", async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await productAdminList(ctx, 0, true); });
composer.callbackQuery(/^admin:products:page:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await productAdminList(ctx, Number(ctx.match[1]), true); });
composer.callbackQuery(/^admin:product:view:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await productDetail(ctx, ctx.match[1]); });
composer.callbackQuery("admin:product:create", async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await chooseCategory(ctx, "admin:product:create:"); });
composer.callbackQuery(/^admin:product:create:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await startCreate(ctx, ctx.match[1]); });
composer.callbackQuery(/^admin:product:edit:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (await owner(ctx)) await startEdit(ctx, ctx.match[1]); });
composer.callbackQuery(/^admin:product:field:(name|photo|description|price|availability|category):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const product = await getCatalogProduct(ctx.match[2]); if (!product) return ctx.reply("Товар больше недоступен."); await startField(ctx, ctx.match[1] as "name" | "photo" | "description" | "price" | "availability" | "category"); });
composer.callbackQuery(/^admin:product:set-category:(.+):(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const flow = ctx.session.flow; const category = await getCatalogCategory(ctx.match[2]); if (!category || !flow || flow.kind !== "product-edit") return ctx.reply("Категория больше недоступна."); ctx.session.flow = { ...flow, categoryId: category.id, field: undefined }; await ctx.reply("Категория изменена. Нажмите «Сохранить», чтобы применить изменения.", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", "admin:product:save-edit:" + flow.productId), inlineButton("Отмена", "admin:product:view:" + flow.productId)]]) }); });
composer.callbackQuery(/^admin:product:set-availability:(.+):(in_stock|out_of_stock)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const flow = ctx.session.flow; if (!flow || flow.kind !== "product-edit") return ctx.reply("Форма товара устарела. Начните редактирование снова."); ctx.session.flow = { ...flow, availability: ctx.match[2] as "in_stock" | "out_of_stock", field: undefined }; await ctx.reply("Наличие изменено. Нажмите «Сохранить», чтобы применить изменения.", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", "admin:product:save-edit:" + flow.productId), inlineButton("Отмена", "admin:product:view:" + flow.productId)]]) }); });
composer.callbackQuery(/^admin:product:remove-photo:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const flow = ctx.session.flow; if (!flow || flow.kind !== "product-edit") return ctx.reply("Форма товара устарела. Начните редактирование снова."); ctx.session.flow = { ...flow, photo: undefined, field: undefined }; await ctx.reply("Фото удалено из формы. Нажмите «Сохранить», чтобы применить изменения.", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", "admin:product:save-edit:" + flow.productId), inlineButton("Отмена", "admin:product:view:" + flow.productId)]]) }); });
composer.callbackQuery(/^admin:product:save-edit:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const flow = ctx.session.flow; if (!flow || flow.kind !== "product-edit" || flow.productId !== ctx.match[1]) return ctx.reply("Форма товара устарела. Начните редактирование снова."); await saveEdit(ctx, flow); });
composer.callbackQuery(/^admin:product:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const product = await getCatalogProduct(ctx.match[1]); if (!product) return ctx.reply("Товар больше недоступен."); await ctx.reply(`Удалить товар «${product.name}»?`, { reply_markup: inlineKeyboard([[inlineButton("Да", "admin:product:delete-confirm:" + product.id), inlineButton("Отмена", "admin:product:view:" + product.id)]]) }); });
composer.callbackQuery(/^admin:product:delete-confirm:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const deleted = await deleteCatalogProduct(ctx.match[1]); if (!deleted) return ctx.reply("Товар больше недоступен."); await ctx.reply("Товар удалён."); await productAdminList(ctx); });
composer.callbackQuery(/^admin:product:availability:(in_stock|out_of_stock)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const flow = ctx.session.flow; if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit")) return ctx.reply("Форма товара устарела. Начните снова."); const next = { ...flow, availability: ctx.match[1] as "in_stock" | "out_of_stock", step: "availability" as const }; ctx.session.flow = next; await ctx.reply("Наличие выбрано. Нажмите «Сохранить», чтобы применить изменения.", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", flow.kind === "product-edit" ? "admin:product:save-edit:" + flow.productId : "admin:product:save")]]) }); });
composer.on("message:photo", async (ctx, next) => { const flow = ctx.session.flow; if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit")) return next(); if (!(await owner(ctx))) return; const photo = ctx.message.photo.at(-1)?.file_id; if (!photo) return ctx.reply("Не удалось получить фото. Загрузите его ещё раз."); if (flow.kind === "product-edit" && flow.step === "field" && flow.field === "photo") { ctx.session.flow = { ...flow, photo, field: undefined }; await ctx.replyWithPhoto(photo, { caption: "Предпросмотр нового фото" }); return ctx.reply("Фото добавлено в форму. Нажмите «Сохранить», чтобы применить изменения.", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", "admin:product:save-edit:" + flow.productId), inlineButton("Отмена", "admin:product:view:" + flow.productId)]]) }); } if (flow.kind === "product-create" && flow.step === "photo") { ctx.session.flow = { ...flow, photo, step: "description" }; return ctx.reply("Введите описание товара", { reply_markup: force("Описание товара") }); } return next(); });
composer.on("message:text", async (ctx, next) => { const flow = ctx.session.flow; if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit")) return next(); if (!(await owner(ctx))) return; const text = ctx.message.text.trim(); if (flow.kind === "product-edit" && flow.step === "field" && flow.field) { if (flow.field === "name" && text) ctx.session.flow = { ...flow, name: text, field: undefined }; else if (flow.field === "description" && text) ctx.session.flow = { ...flow, description: text, field: undefined }; else if (flow.field === "price") { const price = Number(text.replace(",", ".")); if (!Number.isFinite(price) || price < 0) return ctx.reply("Цена должна быть числом не меньше нуля.", { reply_markup: force("Цена") }); ctx.session.flow = { ...flow, price, field: undefined }; } else return ctx.reply("Поле не может быть пустым."); return ctx.reply("Изменение добавлено в форму. Нажмите «Сохранить», чтобы применить изменения.", { reply_markup: inlineKeyboard([[inlineButton("Сохранить", "admin:product:save-edit:" + flow.productId), inlineButton("Отмена", "admin:product:view:" + flow.productId)]]) }); }
  if (flow.kind === "product-create") { if (flow.step === "name") { if (!text) return ctx.reply("Название не может быть пустым.", { reply_markup: force("Название товара") }); ctx.session.flow = { ...flow, name: text, step: "photo" }; return ctx.reply("Загрузите фото товара.", { reply_markup: force("Фото товара") }); } if (flow.step === "photo") return ctx.reply("Загрузите фото товара как изображение."); if (flow.step === "description") { if (!text) return ctx.reply("Описание не может быть пустым.", { reply_markup: force("Описание товара") }); ctx.session.flow = { ...flow, description: text, step: "price" }; return ctx.reply("Введите цену числом.", { reply_markup: force("Цена") }); } if (flow.step === "price") { const price = Number(text.replace(",", ".")); if (!Number.isFinite(price) || price < 0) return ctx.reply("Цена должна быть числом не меньше нуля.", { reply_markup: force("Цена") }); ctx.session.flow = { ...flow, price, step: "availability" }; return availabilityChoice(ctx, "admin:product:availability:"); } }
  return next(); });
composer.callbackQuery("admin:product:save", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const flow = ctx.session.flow; if (!flow || flow.kind !== "product-create") return ctx.reply("Форма товара устарела. Начните снова."); await saveCreate(ctx, flow); });

export default composer;
