import { now } from "./store.js";
export interface Quote { ticker: string; name: string; price: number; currency: string; source: string; timestamp: number; }
const ids: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", TON: "the-open-network" };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function quote(ticker: string, currency = "USD"): Promise<Quote | undefined> {
  const symbol = ticker.trim().toUpperCase(); if (!/^[A-Z0-9]{2,12}$/.test(symbol)) return undefined;
  const id = ids[symbol] ?? symbol.toLowerCase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${currency.toLowerCase()}&include_last_updated_at=true`);
      if (!response.ok) { if (response.status === 429 || response.status >= 500) { await sleep(25 * 2 ** attempt); continue; } return undefined; }
      const data = await response.json() as Record<string, Record<string, number>>;
      const row = data[id]; const value = row?.[currency.toLowerCase()];
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      return { ticker: symbol, name: symbol, price: value, currency: currency.toUpperCase(), source: "CoinGecko", timestamp: now() };
    } catch { if (attempt < 2) await sleep(25 * 2 ** attempt); }
  }
  return undefined;
}
