export type MarketType = "crypto" | "stock";

export function getMarketType(symbol: string): MarketType {
  return symbol.endsWith("USDT") ? "crypto" : "stock";
}

export function getLogoUrl(symbol: string): string {
  if (getMarketType(symbol) === "crypto") {
    const base = symbol.replace(/USDT$/, "").toLowerCase();
    return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${base}.png`;
  }
  return `https://financialmodelingprep.com/image-stock/${symbol.toUpperCase()}.png`;
}
