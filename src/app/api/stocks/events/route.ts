import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/stocks/commodities";
import type { StockEvent, StockEventsResponse } from "@/lib/stocks/events";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const DAY = 86400;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CRUMB_TTL_MS = 60 * 60 * 1000;

// Events barely change intra-day — cache per symbol so switching charts back and forth is instant
const cache = new Map<string, { at: number; data: StockEventsResponse }>();

// quoteSummary / visualization need a session cookie + matching "crumb" token
let session: { cookie: string; crumb: string; at: number } | null = null;

async function getSession(force = false) {
  if (!force && session && Date.now() - session.at < CRUMB_TTL_MS) return session;
  const res = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
    cache: "no-store",
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    cache: "no-store",
  });
  const crumb = await crumbRes.text();
  if (!crumbRes.ok || !crumb || crumb.includes("<")) throw new Error("yahoo crumb");
  session = { cookie, crumb, at: Date.now() };
  return session;
}

async function yahooAuthed<T>(url: string, init?: RequestInit): Promise<T | null> {
  for (const force of [false, true]) {
    const s = await getSession(force);
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}crumb=${encodeURIComponent(s.crumb)}`, {
      ...init,
      headers: { "User-Agent": UA, Cookie: s.cookie, ...init?.headers },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok) return null;
    return (await res.json()) as T;
  }
  return null;
}

interface ChartEvents {
  chart: {
    result: Array<{
      events?: {
        dividends?: Record<string, { amount: number; date: number }>;
        splits?: Record<string, { date: number; numerator: number; denominator: number; splitRatio: string }>;
      };
    }> | null;
  };
}

async function fetchDividendsAndSplits(symbol: string): Promise<StockEvent[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1mo&range=max&events=div,splits`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as ChartEvents;
  const ev = data.chart.result?.[0]?.events;
  const out: StockEvent[] = [];
  for (const d of Object.values(ev?.dividends ?? {})) {
    out.push({ type: "dividend", time: d.date, amount: d.amount });
  }
  for (const s of Object.values(ev?.splits ?? {})) {
    out.push({ type: "split", time: s.date, ratio: `${s.numerator}:${s.denominator}` });
  }
  return out;
}

interface VizResponse {
  finance: {
    result: Array<{ documents: Array<{ rows: Array<[string, number | null, number | null, number | null, string]> }> }> | null;
  };
}

interface Raw {
  raw: number;
}
interface QuoteSummary {
  quoteSummary: {
    result: Array<{
      calendarEvents?: {
        earnings?: { earningsDate?: Raw[]; earningsCallDate?: Raw[]; earningsAverage?: Raw };
      };
      earningsHistory?: {
        history?: Array<{ epsActual?: Raw; epsEstimate?: Raw; surprisePercent?: Raw; quarter?: Raw }>;
      };
    }> | null;
  };
}

interface TimeseriesResponse {
  timeseries: {
    result: Array<{
      quarterlyDilutedEPS?: Array<{ asOfDate: string; reportedValue: Raw } | null>;
    }> | null;
  };
}

/**
 * Earnings come from three Yahoo sources, none complete on its own:
 * - visualization: exact report dates + EPS, but its history can lag several quarters behind
 * - quoteSummary: last 4 quarters (quarter-end only, no report date) + last/next report dates
 * - fundamentals timeseries: ~5 quarters of reported EPS (quarter-end only)
 * Quarters newer than the visualization data get a report date estimated from the same
 * quarter a year earlier (companies report on a steady calendar), flagged as `estimated`.
 */
async function fetchEarnings(symbol: string): Promise<{ events: StockEvent[]; next: StockEventsResponse["nextEarnings"] }> {
  const now = Math.floor(Date.now() / 1000);
  const [viz, summary, series] = await Promise.all([
    yahooAuthed<VizResponse>("https://query2.finance.yahoo.com/v1/finance/visualization?lang=en-US&region=US", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: 100,
        offset: 0,
        query: {
          operator: "and",
          operands: [
            { operator: "eq", operands: ["ticker", symbol] },
            { operator: "eq", operands: ["eventtype", "2"] },
          ],
        },
        sortField: "startdatetime",
        sortType: "DESC",
        entityIdType: "earnings",
        includeFields: ["startdatetime", "epsestimate", "epsactual", "epssurprisepct", "eventtype"],
      }),
    }).catch(() => null),
    yahooAuthed<QuoteSummary>(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        symbol,
      )}?modules=earningsHistory,calendarEvents`,
    ).catch(() => null),
    fetch(
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
        symbol,
      )}?type=quarterlyDilutedEPS&period1=${now - 3 * 365 * DAY}&period2=${now}`,
      { headers: { "User-Agent": UA }, cache: "no-store" },
    )
      .then((r) => (r.ok ? (r.json() as Promise<TimeseriesResponse>) : null))
      .catch(() => null),
  ]);

  const events: StockEvent[] = [];
  const rows = viz?.finance.result?.[0]?.documents?.[0]?.rows ?? [];
  for (const [date, estimate, actual, surprise] of rows) {
    // ETFs/funds come back with report rows but no EPS — they have no earnings to show
    if (actual === null) continue;
    const time = Math.floor(Date.parse(date) / 1000);
    if (time > now) continue;
    events.push({ type: "earnings", time, epsActual: actual, epsEstimate: estimate, surprisePct: surprise });
  }
  const lastExact = events.reduce((m, e) => Math.max(m, e.time), 0);

  const result = summary?.quoteSummary.result?.[0];
  const cal = result?.calendarEvents?.earnings;

  // Quarter-end → EPS for quarters the visualization data doesn't cover yet
  const quarters = new Map<number, { actual: number; estimate: number | null; surprise: number | null }>();
  const nearby = (qe: number) => [...quarters.keys()].find((k) => Math.abs(k - qe) < 20 * DAY);
  for (const h of result?.earningsHistory?.history ?? []) {
    if (!h.quarter || h.epsActual?.raw == null) continue;
    quarters.set(h.quarter.raw, {
      actual: h.epsActual.raw,
      estimate: h.epsEstimate?.raw ?? null,
      surprise: h.surprisePercent ? h.surprisePercent.raw * 100 : null,
    });
  }
  for (const p of series?.timeseries.result?.[0]?.quarterlyDilutedEPS ?? []) {
    if (!p) continue;
    const qe = Math.floor(Date.parse(p.asOfDate) / 1000);
    if (nearby(qe) === undefined) quarters.set(qe, { actual: p.reportedValue.raw, estimate: null, surprise: null });
  }

  const lastCall = cal?.earningsCallDate?.[0]?.raw;
  const sortedQuarters = [...quarters.entries()].sort((a, b) => a[0] - b[0]);
  for (const [qe, q] of sortedQuarters) {
    if (qe <= lastExact) continue;
    let time: number;
    let estimated = true;
    const isLatest = qe === sortedQuarters[sortedQuarters.length - 1][0];
    if (isLatest && lastCall && lastCall > qe && lastCall <= now) {
      time = lastCall;
      estimated = false;
    } else {
      const yearAgo = events.find(
        (e) => e.type === "earnings" && !e.estimated && e.time > qe - 365 * DAY && e.time < qe - 250 * DAY,
      );
      time = yearAgo ? yearAgo.time + 364 * DAY : qe + 30 * DAY;
    }
    if (time <= lastExact || time > now) continue;
    events.push({
      type: "earnings",
      time,
      epsActual: q.actual,
      epsEstimate: q.estimate,
      surprisePct: q.surprise,
      estimated,
    });
  }

  const nextTime = cal?.earningsDate?.[0]?.raw;
  const next =
    nextTime && nextTime > now
      ? { time: nextTime, epsEstimate: cal?.earningsAverage?.raw ?? null }
      : null;
  return { events, next };
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }
  const yahooSymbol = toYahooSymbol(symbol);

  const hit = cache.get(yahooSymbol);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return NextResponse.json(hit.data);

  // Futures / indices have no corporate events — earnings lookups would just fail
  const hasCorporateEvents = !yahooSymbol.includes("=") && !yahooSymbol.startsWith("^");
  const [divSplits, earnings] = await Promise.all([
    fetchDividendsAndSplits(yahooSymbol).catch(() => []),
    hasCorporateEvents
      ? fetchEarnings(yahooSymbol).catch(() => ({ events: [], next: null }))
      : Promise.resolve({ events: [], next: null }),
  ]);

  const data: StockEventsResponse = {
    events: [...divSplits, ...earnings.events].sort((a, b) => a.time - b.time),
    nextEarnings: earnings.next,
  };
  cache.set(yahooSymbol, { at: Date.now(), data });
  return NextResponse.json(data);
}
