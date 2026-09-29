export type StockEventType = "dividend" | "split" | "earnings";
/** Everything that can be toggled in the "Eventos" menu: corporate events plus the news feed */
export type ChartEventKey = StockEventType | "news";

export type StockEvent =
  | { type: "dividend"; time: number; amount: number }
  | { type: "split"; time: number; ratio: string }
  | {
      type: "earnings";
      time: number;
      epsActual: number;
      epsEstimate: number | null;
      surprisePct: number | null;
      /** Report date inferred from the company's usual calendar (exact date unavailable) */
      estimated?: boolean;
    };

export interface StockEventsResponse {
  events: StockEvent[];
  nextEarnings: { time: number; epsEstimate: number | null } | null;
}

export const EVENT_STYLE: Record<StockEventType, { letter: string; color: string; label: string }> = {
  dividend: { letter: "D", color: "#26a69a", label: "Dividendos" },
  split: { letter: "S", color: "#ab47bc", label: "Splits" },
  earnings: { letter: "E", color: "#ff9800", label: "Resultados (earnings)" },
};

export async function fetchStockEvents(symbol: string): Promise<StockEventsResponse> {
  const res = await fetch(`/api/stocks/events?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`stock events ${res.status}`);
  return (await res.json()) as StockEventsResponse;
}

/**
 * Snaps each event onto the candle that contains it (last candle starting at or before
 * the event), so markers line up on any timeframe. Events outside the loaded range are dropped.
 * Returns candle time → events on that candle.
 */
export function bucketEventsByCandle<T extends { time: number }>(
  events: T[],
  candleTimes: number[],
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  if (candleTimes.length === 0) return out;
  const first = candleTimes[0];
  const last = candleTimes[candleTimes.length - 1];
  const step = candleTimes.length > 1 ? last - candleTimes[candleTimes.length - 2] : 86400;
  for (const e of events) {
    if (e.time < first || e.time >= last + step) continue;
    let lo = 0;
    let hi = candleTimes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (candleTimes[mid] <= e.time) lo = mid;
      else hi = mid - 1;
    }
    const t = candleTimes[lo];
    const list = out.get(t);
    if (list) list.push(e);
    else out.set(t, [e]);
  }
  return out;
}

export function describeEvent(e: StockEvent): string {
  switch (e.type) {
    case "dividend":
      return `Dividendo: $${e.amount.toFixed(4).replace(/0{1,2}$/, "")}`;
    case "split":
      return `Split ${e.ratio}`;
    case "earnings": {
      const parts = [`Resultados: EPS ${e.epsActual.toFixed(2)}`];
      if (e.epsEstimate !== null) parts.push(`est. ${e.epsEstimate.toFixed(2)}`);
      if (e.surprisePct !== null)
        parts.push(`(${e.surprisePct >= 0 ? "+" : ""}${e.surprisePct.toFixed(1)}%)`);
      if (e.estimated) parts.push("· fecha aprox.");
      return parts.join(" ");
    }
  }
}
