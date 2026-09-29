import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/stocks/commodities";

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: { regularMarketTime?: number };
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

  const { meta, timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const candles = timestamp
    .map((t, i) => ({
      time: t,
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      // Indices (^VIX, ^MERV…) often report no volume — keep the candle, just with 0 volume
      volume: quote.volume[i] ?? 0,
    }))
    .filter(
      (c): c is { time: number; open: number; high: number; low: number; close: number; volume: number } =>
        c.open !== null && c.high !== null && c.low !== null && c.close !== null,
    );

  mergeLiveTick(candles, meta.regularMarketTime);

  return NextResponse.json(candles);
}

type Kline = { time: number; open: number; high: number; low: number; close: number; volume: number };

/**
 * During market hours Yahoo appends a live point stamped with the last trade time
 * (e.g. 19:58:40) instead of the bar's open time. Its timestamp changes on every request,
 * so the chart would add a new flat candle on each poll. Fold it into the bar it belongs to.
 */
function mergeLiveTick(candles: Kline[], regularMarketTime: number | undefined) {
  if (regularMarketTime === undefined || candles.length < 3) return;
  const tick = candles[candles.length - 1];
  if (tick.time !== regularMarketTime) return;
  const bar = candles[candles.length - 2];
  // Smallest recent bar spacing ≈ the interval (weekends/overnight gaps only make it bigger)
  let step = Infinity;
  for (let i = Math.max(1, candles.length - 6); i < candles.length - 1; i++) {
    step = Math.min(step, candles[i].time - candles[i - 1].time);
  }
  if (tick.time - bar.time >= step) {
    // Tick opens a bar Yahoo hasn't published yet — stamp it with that bar's open time
    candles[candles.length - 1] = {
      ...tick,
      time: bar.time + Math.floor((tick.time - bar.time) / step) * step,
    };
    return;
  }
  candles[candles.length - 2] = {
    ...bar,
    high: Math.max(bar.high, tick.high),
    low: Math.min(bar.low, tick.low),
    close: tick.close,
    // Intraday ticks carry 0 volume; on weekly/monthly the tick is today's session,
    // which the bar doesn't include yet
    volume: bar.volume + tick.volume,
  };
  candles.pop();
}
