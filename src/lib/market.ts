import { getDollarInfo } from "@/lib/stocks/dollars";

export type MarketType = "crypto" | "stock";

export function getMarketType(symbol: string): MarketType {
  return symbol.endsWith("USDT") ? "crypto" : "stock";
}

/** Short label for the watchlist: DOLARMEP -> MEP (the full ticker doesn't fit the column) */
export function getWatchlistLabel(symbol: string): string {
  if (getMarketType(symbol) === "crypto") return symbol.replace(/USDT$/, "");
  return getDollarInfo(symbol) ? symbol.replace(/^DOLAR/, "") : symbol;
}

export function getLogoUrl(symbol: string): string {
  if (getMarketType(symbol) === "crypto") {
    const base = symbol.replace(/USDT$/, "").toLowerCase();
    return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${base}.png`;
  }
  // The logo service matches tickers loosely and returns random companies for DOLAROFICIAL etc.
  if (getDollarInfo(symbol)) return DOLLAR_LOGO;
  return `https://financialmodelingprep.com/image-stock/${symbol.toUpperCase()}.png`;
}

const DOLLAR_LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#2e7d32"/><text x="10" y="14.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#fff">$</text></svg>',
  );
