import { getIndexInfo } from "./indices";

export interface CommodityInfo {
  symbol: string;
  yahooSymbol: string;
  name: string;
}

// Friendly ticker aliases (as commonly used by trading platforms) mapped to
// their real Yahoo Finance futures symbol, since Yahoo has no "USOIL" ticker.
export const COMMODITIES: CommodityInfo[] = [
  { symbol: "USOIL", yahooSymbol: "CL=F", name: "WTI Crude Oil" },
  { symbol: "UKOIL", yahooSymbol: "BZ=F", name: "Brent Crude Oil" },
  { symbol: "NATGAS", yahooSymbol: "NG=F", name: "Natural Gas" },
  { symbol: "XAUUSD", yahooSymbol: "GC=F", name: "Gold" },
  { symbol: "XAGUSD", yahooSymbol: "SI=F", name: "Silver" },
  { symbol: "COPPER", yahooSymbol: "HG=F", name: "Copper" },
  { symbol: "CORN", yahooSymbol: "ZC=F", name: "Corn" },
  { symbol: "WHEAT", yahooSymbol: "ZW=F", name: "Wheat" },
  { symbol: "SOYBEAN", yahooSymbol: "ZS=F", name: "Soybean" },
  { symbol: "COFFEE", yahooSymbol: "KC=F", name: "Coffee" },
  { symbol: "SUGAR", yahooSymbol: "SB=F", name: "Sugar" },
  { symbol: "COTTON", yahooSymbol: "CT=F", name: "Cotton" },
];

const BY_SYMBOL = new Map(COMMODITIES.map((c) => [c.symbol, c]));

export function getCommodityInfo(symbol: string): CommodityInfo | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function isCommoditySymbol(symbol: string): boolean {
  return BY_SYMBOL.has(symbol.toUpperCase());
}

/**
 * Translates a friendly commodity (USOIL) or index (NASDAQ) ticker to its Yahoo Finance
 * symbol (CL=F, ^IXIC). Anything else is passed through unchanged.
 */
export function toYahooSymbol(symbol: string): string {
  return (
    BY_SYMBOL.get(symbol.toUpperCase())?.yahooSymbol ??
    getIndexInfo(symbol)?.yahooSymbol ??
    symbol
  );
}

export function searchCommodities(query: string): CommodityInfo[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return COMMODITIES.filter(
    (c) => c.symbol.includes(q) || c.name.toUpperCase().includes(q),
  );
}
