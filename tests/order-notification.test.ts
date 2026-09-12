import { afterEach, describe, expect, it } from "vitest";
import type { Transformer } from "grammy";
import { buildBot } from "../src/bot.js";
import { callbackUpdate, textUpdate } from "../src/toolkit/harness/updates.js";

const fakeBotInfo = {
  id: 42,
  is_bot: true,
  first_name: "TestBot",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as const;

afterEach(() => {
  delete process.env.ADMIN_CHAT_ID;
});

describe("order confirmation notification", () => {
  it("sends the owner a real order summary with an order deep link", async () => {
    process.env.ADMIN_CHAT_ID = "9001";
    const bot = await buildBot("test-token");
    (bot as unknown as { botInfo: typeof fakeBotInfo }).botInfo = fakeBotInfo;
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const capture: Transformer = async (_prev, method, payload) => {
      calls.push({ method, payload: (payload ?? {}) as Record<string, unknown> });
      return { ok: true, result: true } as never;
    };
    bot.api.config.use(capture);

    let updateId = 0;
    const text = async (value: string) => bot.handleUpdate(textUpdate(++updateId, value));
    const tap = async (value: string) => bot.handleUpdate(callbackUpdate(++updateId, value));
    await tap("catalog:cart:add:electronics:desk-lamp");
    await tap("checkout:start");
    await text("Иван Петров");
    await text("+7 900 123-45-67");
    await text("Москва");
    await text("ул. Тверская, 1");
    await tap("checkout:delivery:delivery_address");
    await tap("checkout:payment:card");
    await tap("checkout:confirm");

    const notification = calls.find((call) => call.method === "sendMessage" && call.payload.chat_id === "9001");
    expect(notification?.payload.text).toMatch(/^🆕 Новый заказ №ORD-/);
    expect(notification?.payload.text).toContain("Покупатель: Иван Петров");
    expect(notification?.payload.text).toContain("Телефон: +7 900 123-45-67");
    expect(notification?.payload.text).toContain("1× Настольная лампа");
    expect(notification?.payload.text).toContain("Итого: 2 490 RUB");
    expect(notification?.payload.text).toContain("Способ оплаты: 💳 Оплата картой");
    expect(notification?.payload.text).toContain("Способ получения: 🚚 Доставка по адресу");

    const markup = notification?.payload.reply_markup as { inline_keyboard?: Array<Array<Record<string, string>>> };
    expect(markup.inline_keyboard).toHaveLength(3);
    expect(markup.inline_keyboard?.[0]).toHaveLength(1);
    expect(markup.inline_keyboard?.[0]?.[0]?.text).toBe("📦 Открыть заказ");
    expect(markup.inline_keyboard?.[0]?.[0]?.url).toMatch(/^https:\/\/t\.me\/test_bot\?start=admin_order_ORD-/);
    expect(markup.inline_keyboard?.[1]?.[0]).toEqual({ text: "Главное меню", callback_data: "menu:main" });
    expect(markup.inline_keyboard?.[2]?.[0]).toEqual({ text: "⬅️ Назад", callback_data: "nav:back" });
  });
});
