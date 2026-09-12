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
  updateCatalogProduct,
} from "../store.js";

const composer = new Composer<Ctx>();

async function owner(ctx: Ctx) {
  return requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]);
}

async function productAdminList(ctx: Ctx, edit = false) {
  const categories = await listCatalogCategories();
  const rows = categories.map((category) => [
    inlineButton(category.name, "admin:products:category:" + category.id),
  ]);
  rows.push([inlineButton("Создать товар", "admin:product:create")]);
  rows.push([inlineButton("Обновить список", "admin:products")]);
  const options = { reply_markup: inlineKeyboard(rows) };
  if (edit && ctx.callbackQuery) await ctx.editMessageText("Управление товарами\nВыберите категорию.", options);
  else await ctx.reply("Управление товарами\nВыберите категорию.", options);
}

async function categoryProducts(ctx: Ctx, categoryId: string) {
  const category = await getCatalogCategory(categoryId);
  if (!category) return ctx.reply("Категория больше недоступна.");
  const products = await listCatalogProducts(category.id);
  const rows = products.map((product) => [
    inlineButton("Изменить: " + product.name, "admin:product:edit:" + product.id),
    inlineButton("Удалить", "admin:product:delete:" + product.id),
  ]);
  rows.push([inlineButton("Создать товар", "admin:product:create:" + category.id)]);
  rows.push([inlineButton("К категориям", "admin:products")]);
  await ctx.reply(
    products.length ? "Товары в категории «" + category.name + "»" : "В этой категории пока нет товаров.",
    { reply_markup: inlineKeyboard(rows) },
  );
}

async function startCreate(ctx: Ctx, categoryId: string) {
  if (!(await getCatalogCategory(categoryId))) return ctx.reply("Категория больше недоступна.");
  ctx.session.flow = { kind: "product-create", categoryId, step: "name" };
  await ctx.reply("Введите название товара", { reply_markup: force("Название товара") });
}

async function startEdit(ctx: Ctx, productId: string) {
  const product = await getCatalogProduct(productId);
  if (!product) return ctx.reply("Товар больше недоступен.");
  ctx.session.flow = {
    kind: "product-edit",
    productId: product.id,
    categoryId: product.categoryId,
    step: "name",
    name: product.name,
    photo: product.photo,
    description: product.description,
    price: product.price,
    availability: product.availability,
    stockCount: product.stockCount,
  };
  await ctx.reply("Текущее название: " + product.name + "\nВведите новое название или отправьте «-» без изменений.", { reply_markup: force("Название товара") });
}

async function saveFlow(ctx: Ctx, flow: Extract<NonNullable<Ctx["session"]["flow"]>, { kind: "product-create" | "product-edit" }>) {
  if (!flow.name || !flow.photo || !flow.description || flow.price === undefined || !flow.availability) {
    ctx.session.flow = undefined;
    return ctx.reply("Форма товара устарела. Откройте управление товарами и начните снова.");
  }
  const data = {
    categoryId: flow.categoryId,
    name: flow.name,
    photo: flow.photo,
    description: flow.description,
    price: flow.price,
    currency: "RUB",
    availability: flow.availability,
    stockCount: flow.availability === "in_stock" ? flow.stockCount : undefined,
  } as const;
  const product = flow.kind === "product-create"
    ? await createCatalogProduct(data)
    : await updateCatalogProduct(flow.productId, data);
  ctx.session.flow = undefined;
  if (!product) return ctx.reply("Товар больше недоступен.");
  await ctx.reply(flow.kind === "product-create" ? "Товар сохранён." : "Изменения сохранены.");
  await categoryProducts(ctx, product.categoryId);
}

async function chooseAvailability(ctx: Ctx) {
  await ctx.reply("Выберите наличие товара", {
    reply_markup: inlineKeyboard([
      [inlineButton("В наличии", "admin:product:availability:in_stock"), inlineButton("Нет в наличии", "admin:product:availability:out_of_stock")],
    ]),
  });
}

async function saveButton(ctx: Ctx) {
  await ctx.reply("Проверьте данные товара и сохраните их.", {
    reply_markup: inlineKeyboard([[inlineButton("Сохранить", "admin:product:save")]]),
  });
}

composer.command("admin_products", async (ctx) => {
  if (!(await owner(ctx))) return;
  await productAdminList(ctx);
});

composer.callbackQuery("admin:products", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await productAdminList(ctx, true);
});

composer.callbackQuery(/^admin:products:category:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await categoryProducts(ctx, ctx.match[1]);
});

composer.callbackQuery(/^admin:product:create:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await startCreate(ctx, ctx.match[1]);
});

composer.callbackQuery("admin:product:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const categories = await listCatalogCategories();
  await ctx.reply("Выберите категорию для нового товара.", {
    reply_markup: inlineKeyboard(categories.map((category) => [inlineButton(category.name, "admin:product:create:" + category.id)])),
  });
});

composer.callbackQuery(/^admin:product:edit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  await startEdit(ctx, ctx.match[1]);
});

composer.callbackQuery(/^admin:product:delete:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const product = await getCatalogProduct(ctx.match[1]);
  if (!product) return ctx.reply("Товар больше недоступен.");
  await ctx.reply("Удалить товар «" + product.name + "»? Это действие нельзя отменить.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Удалить", "admin:product:delete-confirm:" + product.id), inlineButton("Оставить", "admin:products:category:" + product.categoryId)],
    ]),
  });
});

composer.callbackQuery(/^admin:product:delete-confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const deleted = await deleteCatalogProduct(ctx.match[1]);
  await ctx.reply(deleted ? "Товар удалён." : "Товар больше недоступен.");
  if (deleted) await productAdminList(ctx);
});

composer.callbackQuery("admin:product:keep-photo", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const flow = ctx.session.flow;
  if (!flow || flow.kind !== "product-edit" || flow.step !== "photo") return ctx.reply("Форма товара устарела. Начните редактирование снова.");
  ctx.session.flow = { ...flow, step: "description" };
  await ctx.reply("Введите описание или отправьте «-» без изменений.", { reply_markup: force("Описание товара") });
});

composer.callbackQuery(/^admin:product:availability:(in_stock|out_of_stock)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const flow = ctx.session.flow;
  if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit") || flow.step !== "availability") return ctx.reply("Форма товара устарела. Начните снова из управления товарами.");
  const availability = ctx.match[1] as "in_stock" | "out_of_stock";
  if (availability === "out_of_stock") {
    ctx.session.flow = { ...flow, availability };
    return saveButton(ctx);
  }
  ctx.session.flow = { ...flow, availability };
  await ctx.reply("Введите количество на складе или 0, если количество не отслеживается.", { reply_markup: force("Количество") });
});

composer.on("message:photo", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit") || flow.step !== "photo") return next();
  if (!(await owner(ctx))) return;
  const photo = ctx.message.photo.at(-1);
  if (!photo) return ctx.reply("Не удалось получить фото. Загрузите его ещё раз.");
  ctx.session.flow = { ...flow, step: "description", photo: photo.file_id };
  await ctx.reply("Введите описание товара", { reply_markup: force("Описание товара") });
});

composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit")) return next();
  if (!(await owner(ctx))) return;
  const text = ctx.message.text.trim();
  if (flow.step === "name") {
    if (!text) return ctx.reply("Название не может быть пустым. Введите название товара", { reply_markup: force("Название товара") });
    ctx.session.flow = { ...flow, step: "photo", name: text === "-" && flow.kind === "product-edit" ? flow.name : text };
    return ctx.reply("Загрузите одно фото товара" + (flow.kind === "product-edit" ? " или нажмите «Оставить фото»." : ""), { reply_markup: force("Фото товара") });
  }
  if (flow.step === "photo") return ctx.reply("Загрузите фото товара как изображение.");
  if (flow.step === "description") {
    if (!text) return ctx.reply("Описание не может быть пустым. Введите описание товара", { reply_markup: force("Описание товара") });
    ctx.session.flow = { ...flow, step: "price", description: text === "-" && flow.kind === "product-edit" ? flow.description : text };
    return ctx.reply("Введите цену числом", { reply_markup: force("Цена") });
  }
  if (flow.step === "price") {
    const price = Number(text.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) return ctx.reply("Цена должна быть числом не меньше нуля. Введите цену ещё раз", { reply_markup: force("Цена") });
    ctx.session.flow = { ...flow, step: "availability", price };
    return chooseAvailability(ctx);
  }
  if (flow.step === "availability") {
    const stockCount = Number(text);
    if (!Number.isInteger(stockCount) || stockCount < 0) return ctx.reply("Количество должно быть целым числом не меньше нуля.", { reply_markup: force("Количество") });
    ctx.session.flow = { ...flow, stockCount, availability: flow.availability ?? "in_stock" };
    return saveButton(ctx);
  }
  return next();
});

composer.callbackQuery("admin:product:save", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) return;
  const flow = ctx.session.flow;
  if (!flow || (flow.kind !== "product-create" && flow.kind !== "product-edit") || flow.step !== "availability") return ctx.reply("Форма товара устарела. Начните снова из управления товарами.");
  await saveFlow(ctx, flow);
});

export default composer;
