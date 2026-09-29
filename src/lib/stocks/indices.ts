export interface IndexInfo {
  symbol: string;
  yahooSymbol: string;
  name: string;
}

// Friendly index tickers (as commonly used by trading platforms) mapped to their Yahoo
// Finance symbol. Yahoo prefixes indices with "^", which is awkward to type and to show.
export const INDICES: IndexInfo[] = [
  { symbol: "NASDAQ", yahooSymbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "NDX", yahooSymbol: "^NDX", name: "Nasdaq 100" },
  { symbol: "SPX", yahooSymbol: "^GSPC", name: "S&P 500" },
  { symbol: "DJI", yahooSymbol: "^DJI", name: "Dow Jones Industrial Average" },
  { symbol: "RUT", yahooSymbol: "^RUT", name: "Russell 2000" },
  { symbol: "VIX", yahooSymbol: "^VIX", name: "CBOE Volatility Index" },
  { symbol: "DAX", yahooSymbol: "^GDAXI", name: "DAX (Alemania)" },
  { symbol: "UK100", yahooSymbol: "^FTSE", name: "FTSE 100 (Reino Unido)" },
  { symbol: "CAC40", yahooSymbol: "^FCHI", name: "CAC 40 (Francia)" },
  { symbol: "IBEX35", yahooSymbol: "^IBEX", name: "IBEX 35 (España)" },
  { symbol: "STOXX50", yahooSymbol: "^STOXX50E", name: "Euro Stoxx 50" },
  { symbol: "NI225", yahooSymbol: "^N225", name: "Nikkei 225 (Japón)" },
  { symbol: "HSI", yahooSymbol: "^HSI", name: "Hang Seng (Hong Kong)" },
  { symbol: "MERVAL", yahooSymbol: "^MERV", name: "S&P Merval (Argentina)" },
  { symbol: "IBOV", yahooSymbol: "^BVSP", name: "Ibovespa (Brasil)" },
];

const BY_SYMBOL = new Map(INDICES.map((i) => [i.symbol, i]));
const BY_YAHOO = new Map(INDICES.map((i) => [i.yahooSymbol, i]));

export function getIndexInfo(symbol: string): IndexInfo | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

/** Friendly alias for a Yahoo index symbol (^IXIC -> NASDAQ), if we have one */
export function getIndexByYahooSymbol(yahooSymbol: string): IndexInfo | undefined {
  return BY_YAHOO.get(yahooSymbol.toUpperCase());
}

export function searchIndices(query: string): IndexInfo[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return INDICES.filter(
    (i) =>
      i.symbol.includes(q) ||
      i.name.toUpperCase().includes(q) ||
      i.yahooSymbol.includes(q),
  );
}
