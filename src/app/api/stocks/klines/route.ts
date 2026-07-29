import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/stocks/commodities";

interface YahooChartResult {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: unknown;
  };
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const range = req.nextUrl.searchParams.get("range") ?? "1y";

  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }

  const yahooSymbol = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: `yahoo ${res.status}` }, { status: 502 });
  }

  const data = (await res.json()) as YahooChartResult;
  const result = data.chart.result?.[0];
  if (!result) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const candles = timestamp
    .map((t, i) => ({
      time: t,
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i],
    }))
    .filter(
      (c): c is { time: number; open: number; high: number; low: number; close: number; volume: number } =>
        c.open !== null &&
        c.high !== null &&
        c.low !== null &&
        c.close !== null &&
        c.volume !== null,
    );

  return NextResponse.json(candles);
}
