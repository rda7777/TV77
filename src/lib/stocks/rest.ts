import type { Candle, Ticker24h, Timeframe } from "@/lib/binance/types";

interface YahooParams {
  interval: string;
  range: string;
}

const TIMEFRAME_TO_YAHOO: Record<Timeframe, YahooParams> = {
  "1m": { interval: "1m", range: "7d" },
  "3m": { interval: "5m", range: "60d" },
  "5m": { interval: "5m", range: "60d" },
  "15m": { interval: "15m", range: "60d" },
  "30m": { interval: "30m", range: "60d" },
  "1h": { interval: "60m", range: "730d" },
  "2h": { interval: "60m", range: "730d" },
  "4h": { interval: "60m", range: "730d" },
  "6h": { interval: "60m", range: "730d" },
  "8h": { interval: "60m", range: "730d" },
  "12h": { interval: "60m", range: "730d" },
  "1d": { interval: "1d", range: "5y" },
  "3d": { interval: "1d", range: "5y" },
  "1w": { interval: "1wk", range: "10y" },
  "1M": { interval: "1mo", range: "max" },
};

export async function fetchStockKlines(
  symbol: string,
  timeframe: Timeframe,
): Promise<Candle[]> {
  const { interval, range } = TIMEFRAME_TO_YAHOO[timeframe];
  const url = `/api/stocks/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`stock klines ${res.status}`);
  const data = (await res.json()) as Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  return data.map((c) => ({ ...c, isFinal: true }));
}

export async function fetchStockQuotes(symbols: string[]): Promise<Ticker24h[]> {
  if (symbols.length === 0) return [];
  const url = `/api/stocks/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`stock quote ${res.status}`);
  return (await res.json()) as Ticker24h[];
}

export async function searchStockSymbols(
  query: string,
): Promise<{ symbol: string; name: string; kind: "stock" | "etf" | "commodity" | "index" }[]> {
  const url = `/api/stocks/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`stock search ${res.status}`);
  return (await res.json()) as {
    symbol: string;
    name: string;
    kind: "stock" | "etf" | "commodity" | "index";
  }[];
}

const symbolNameCache = new Map<string, string | null>();

/**
 * Resolves a stock/ETF ticker to its company/fund name (e.g. AVGO -> "Broadcom Inc.").
 * Backed by the symbol search endpoint since Yahoo's chart API doesn't expose it. Cached
 * in-memory per symbol to avoid re-querying on every chart re-render.
 */
export async function fetchSymbolName(symbol: string): Promise<string | null> {
  const upper = symbol.toUpperCase();
  if (symbolNameCache.has(upper)) return symbolNameCache.get(upper) ?? null;
  try {
    const results = await searchStockSymbols(upper);
    const exact = results.find((r) => r.symbol.toUpperCase() === upper);
    const name = exact?.name ?? results[0]?.name ?? null;
    symbolNameCache.set(upper, name);
    return name;
  } catch {
    return null;
  }
}
