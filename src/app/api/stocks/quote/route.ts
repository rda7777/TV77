import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/stocks/commodities";

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
      };
    }> | null;
    error: unknown;
  };
}

async function fetchOne(symbol: string) {
  const yahooSymbol = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as YahooChartResult;
  const meta = data.chart.result?.[0]?.meta;
  if (!meta) return null;

  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
  const priceChange = meta.regularMarketPrice - prevClose;
  const priceChangePercent = prevClose === 0 ? 0 : (priceChange / prevClose) * 100;

  return {
    // Keep the friendly symbol (USOIL) rather than Yahoo's (CL=F) so it matches
    // what the watchlist/store keyed the request by.
    symbol,
    lastPrice: meta.regularMarketPrice,
    priceChange,
    priceChangePercent,
    highPrice: meta.regularMarketDayHigh ?? meta.regularMarketPrice,
    lowPrice: meta.regularMarketDayLow ?? meta.regularMarketPrice,
    volume: meta.regularMarketVolume ?? 0,
    quoteVolume: meta.regularMarketVolume ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "missing symbols" }, { status: 400 });
  }
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const quotes = await Promise.all(symbols.map(fetchOne));
  return NextResponse.json(quotes.filter((q) => q !== null));
}
