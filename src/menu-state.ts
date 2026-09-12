import type { Ctx } from "./bot.js";
import type { Flow } from "./store.js";
import type { InlineKeyboardMarkup } from "./toolkit/index.js";

type NavigationEntry = { text: string; markup: unknown; flow?: Flow };
type View = { text: string; markup?: InlineKeyboardMarkup };

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function copyFlow(flow: Flow): Flow {
  // Flow values are plain session data. Copying them prevents a later form
  // edit from mutating the snapshot stored on the navigation stack.
  return flow === undefined ? undefined : JSON.parse(JSON.stringify(flow)) as Flow;
}

/**
 * Render navigation in one message per chat. The session stores only UI state;
 * domain records remain in the durable domain store.
 */
export async function showMenu(ctx: Ctx, view: View, options: { back?: boolean; replace?: boolean } = {}) {
  const markup = view.markup;
  const active = ctx.session.activeMenu;
  if (active && same(active.text, view.text) && same(active.markup, markup)) {
    // Main Menu can be tapped while it is already visible. Keep the same
    // message, but still clear its stack and refresh the saved flow state.
    ctx.session.activeMenu = {
      ...active,
      flow: copyFlow(ctx.session.flow),
      history: options.replace ? [] : active.history,
    };
    return;
  }

  const history = active?.history ? [...active.history] : [];
  if (active && !options.replace && (active.text !== view.text || !same(active.markup, markup))) {
    const previous: NavigationEntry = {
      text: active.text,
      markup: active.markup,
      flow: copyFlow(active.flow),
    };
    if (!history.length || !same(history[history.length - 1], previous)) history.push(previous);
  }

  const payload = { reply_markup: markup };
  try {
    if (active) {
      await ctx.api.editMessageText(ctx.chat?.id ?? ctx.from?.id ?? 0, active.messageId, view.text, payload);
      ctx.session.activeMenu = { messageId: active.messageId, text: view.text, markup, flow: copyFlow(ctx.session.flow), history };
      return;
    }
    if (ctx.callbackQuery?.message) {
      const messageId = ctx.callbackQuery.message.message_id;
      await ctx.editMessageText(view.text, payload);
      ctx.session.activeMenu = { messageId, text: view.text, markup, flow: copyFlow(ctx.session.flow), history };
      return;
    }
  } catch {
    if (active) {
      try { await ctx.api.deleteMessage(ctx.chat?.id ?? ctx.from?.id ?? 0, active.messageId); } catch { /* stale menu */ }
    }
  }

  const sent = await ctx.reply(view.text, payload);
  ctx.session.activeMenu = {
    messageId: sent.message_id,
    text: view.text,
    markup,
    flow: copyFlow(ctx.session.flow),
    history: options.replace ? [] : history,
  };
}

export async function backMenu(ctx: Ctx, fallback: View) {
  const active = ctx.session.activeMenu;
  if (!active?.history.length) {
    ctx.session.flow = undefined;
    return showMenu(ctx, fallback, { replace: true });
  }
  const history = [...active.history];
  const previous = history.pop()!;
  try {
    await ctx.api.editMessageText(ctx.chat?.id ?? ctx.from?.id ?? 0, active.messageId, previous.text, { reply_markup: previous.markup as InlineKeyboardMarkup });
    ctx.session.flow = copyFlow(previous.flow);
    ctx.session.activeMenu = { messageId: active.messageId, text: previous.text, markup: previous.markup, history };
  } catch {
    ctx.session.flow = copyFlow(previous.flow);
    await showMenu(ctx, { text: previous.text, markup: previous.markup as InlineKeyboardMarkup }, { replace: true });
  }
}
