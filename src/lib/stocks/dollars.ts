// Argentine peso exchange rates ("los dólares") as chartable symbols. Yahoo only has the
// official wholesale rate (ARS=X), so history comes from ArgentinaDatos (one quote per day since
// the rate existed) and the live price from DolarAPI, both keyed by the same "casa" name.

export interface DollarInfo {
  symbol: string;
  /** Rate name in ArgentinaDatos / DolarAPI */
  casa: string;
  name: string;
  note: string;
}

export const DOLLARS: DollarInfo[] = [
  {
    symbol: "DOLARMEP",
    casa: "bolsa",
    name: "Dólar MEP (bolsa)",
    note: "Dólar MEP — se obtiene comprando un bono en pesos y vendiéndolo en dólares en el mercado local.",
  },
  {
    symbol: "DOLARCCL",
    casa: "contadoconliqui",
    name: "Dólar contado con liquidación",
    note: "Dólar CCL — como el MEP, pero los dólares se acreditan en una cuenta del exterior.",
  },
  {
    symbol: "DOLARBLUE",
    casa: "blue",
    name: "Dólar blue",
    note: "Dólar blue — cotización del mercado informal (cuevas y arbolitos).",
  },
  {
    symbol: "DOLAROFICIAL",
    casa: "oficial",
    name: "Dólar oficial (minorista)",
    note: "Dólar oficial — precio minorista de referencia de los bancos (promedio BNA).",
  },
  {
    symbol: "DOLARMAYORISTA",
    casa: "mayorista",
    name: "Dólar mayorista",
    note: "Dólar mayorista — tipo de cambio entre bancos y empresas que fija el BCRA (Comunicación A 3500).",
  },
  {
    symbol: "DOLARCRIPTO",
    casa: "cripto",
    name: "Dólar cripto",
    note: "Dólar cripto — precio de las stablecoins (USDT/USDC) en pesos en los exchanges.",
  },
  {
    symbol: "DOLARTARJETA",
    casa: "tarjeta",
    name: "Dólar tarjeta",
    note: "Dólar tarjeta — oficial más los impuestos que se cobran en consumos en el exterior.",
  },
];

const BY_SYMBOL = new Map(DOLLARS.map((d) => [d.symbol, d]));

export function getDollarInfo(symbol: string): DollarInfo | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function searchDollars(query: string): DollarInfo[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  // "dolar", "dólar", "usd", "mep"… all match against symbol and name
  const plain = q.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return DOLLARS.filter(
    (d) =>
      d.symbol.includes(plain) ||
      d.name.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(plain) ||
      (plain === "USD" || plain === "ARS"),
  );
}

export const DOLLARS_SECTION_ID = "dolares-ar";
export const DOLLARS_SECTION_NAME = "Dólares";
export const DOLLAR_SYMBOLS = DOLLARS.map((d) => d.symbol);
export const DOLLAR_NOTES: Record<string, string> = Object.fromEntries(
  DOLLARS.map((d) => [d.symbol, d.note]),
);

// ---- Server-side fetching (used by the /api/stocks routes) ----

type Kline = { time: number; open: number; high: number; low: number; close: number; volume: number };

interface HistoryRow {
  compra: number;
  venta: number;
  fecha: string; // YYYY-MM-DD
}

interface LiveQuote {
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fetchLive(casa: string) {
  return fetchJson<LiveQuote>(`https://dolarapi.com/v1/dolares/${casa}`);
}

/** Midnight UTC of a YYYY-MM-DD date, in seconds — how the chart stamps daily bars */
function dayTime(fecha: string): number {
  return Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) / 1000;
}

/** Today's date in Buenos Aires, YYYY-MM-DD */
function todayAR(iso?: string): string {
  return new Date(iso ?? Date.now()).toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/**
 * Candles of the selling ("venta") price. There is a single quote per day, so each daily bar
 * opens at the previous close and closes at that day's quote. Intraday intervals have no
 * data and fall back to daily bars; weekly and monthly bars aggregate the daily ones.
 */
export async function fetchDollarKlines(symbol: string, interval: string): Promise<Kline[] | null> {
  const info = getDollarInfo(symbol);
  if (!info) return null;
  const [history, live] = await Promise.all([
    fetchJson<HistoryRow[]>(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${info.casa}`),
    fetchLive(info.casa),
  ]);
  if (!history) return null;

  const rows = history.filter((r) => r.venta > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  // The history updates once a day; the live quote moves during the session
  if (live && live.venta > 0) {
    const fecha = todayAR(live.fechaActualizacion);
    const last = rows[rows.length - 1];
    if (last?.fecha === fecha) last.venta = live.venta;
    else if (!last || last.fecha < fecha) rows.push({ compra: live.compra, venta: live.venta, fecha });
  }

  const daily: Kline[] = [];
  let prev: number | null = null;
  for (const r of rows) {
    const open = prev ?? r.venta;
    daily.push({
      time: dayTime(r.fecha),
      open,
      high: Math.max(open, r.venta),
      low: Math.min(open, r.venta),
      close: r.venta,
      volume: 0,
    });
    prev = r.venta;
  }

  if (interval === "1wk" || interval === "1mo") return aggregate(daily, interval);
  return daily;
}

function periodStart(time: number, interval: "1wk" | "1mo"): number {
  const d = new Date(time * 1000);
  if (interval === "1mo") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  // Weeks start on Monday, like Yahoo's weekly bars
  const back = (d.getUTCDay() + 6) % 7;
  return time - back * 86400;
}

function aggregate(daily: Kline[], interval: "1wk" | "1mo"): Kline[] {
  const out: Kline[] = [];
  for (const c of daily) {
    const t = periodStart(c.time, interval);
    const bar = out[out.length - 1];
    if (bar && bar.time === t) {
      bar.high = Math.max(bar.high, c.high);
      bar.low = Math.min(bar.low, c.low);
      bar.close = c.close;
    } else {
      out.push({ ...c, time: t });
    }
  }
  return out;
}

/** Watchlist quote: live selling price vs. the previous day's close */
export async function fetchDollarQuote(symbol: string) {
  const info = getDollarInfo(symbol);
  if (!info) return null;
  const candles = await fetchDollarKlines(symbol, "1d");
  if (!candles || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : last.open;
  const priceChange = last.close - prevClose;
  return {
    symbol,
    lastPrice: last.close,
    priceChange,
    priceChangePercent: prevClose === 0 ? 0 : (priceChange / prevClose) * 100,
    highPrice: last.high,
    lowPrice: last.low,
    volume: 0,
    quoteVolume: 0,
  };
}
