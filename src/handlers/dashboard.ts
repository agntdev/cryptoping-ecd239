import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, requireOwner } from "../toolkit/index.js";
import { data } from "../crypto.js";
const composer = new Composer<Ctx>();
composer.command("dashboard", async (ctx) => {
  const ownerCtx = ctx as unknown as Parameters<typeof requireOwner>[0];
  if (!(await requireOwner(ownerCtx))) return;
  const target = adminChatId(ctx as unknown as { env?: Record<string, unknown> }); if (!target) { await ctx.reply("Owner access isn't set up yet."); return; }
  const d = data(ctx); const counts = d.alerts.reduce<Record<string, number>>((out, a) => { if (a.lastTriggeredAt) out[a.ticker] = (out[a.ticker] ?? 0) + 1; return out; }, {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${t}: ${n}`).join(", ") || "No alerts sent yet";
  const message = `CryptoWatch dashboard\nActive users: ${d.items.length ? 1 : 0}\nTop triggered tickers: ${top}\nRecent price-source errors: ${d.errors}`;
  await ctx.api.sendMessage(target, message); if (String(ctx.chat?.id) !== target) await ctx.reply("Dashboard sent to the owner chat.");
});
export default composer;
