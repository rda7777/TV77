import { NextRequest, NextResponse } from "next/server";
import { searchCommodities } from "@/lib/stocks/commodities";
import { getIndexByYahooSymbol, searchIndices } from "@/lib/stocks/indices";

const FALLBACK_SYMBOLS: { symbol: string; name: string; kind: "stock" | "etf" }[] = [
  { symbol: "AAPL", name: "Apple Inc.", kind: "stock" },
  { symbol: "MSFT", name: "Microsoft Corporation", kind: "stock" },
  { symbol: "GOOGL", name: "Alphabet Inc.", kind: "stock" },
  { symbol: "AMZN", name: "Amazon.com Inc.", kind: "stock" },
  { symbol: "TSLA", name: "Tesla Inc.", kind: "stock" },
  { symbol: "META", name: "Meta Platforms Inc.", kind: "stock" },
  { symbol: "NVDA", name: "NVIDIA Corporation", kind: "stock" },
  { symbol: "NFLX", name: "Netflix Inc.", kind: "stock" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", kind: "stock" },
  { symbol: "INTC", name: "Intel Corporation", kind: "stock" },
  { symbol: "DIS", name: "The Walt Disney Company", kind: "stock" },
  { symbol: "BA", name: "The Boeing Company", kind: "stock" },
  { symbol: "KO", name: "The Coca-Cola Company", kind: "stock" },
  { symbol: "PEP", name: "PepsiCo Inc.", kind: "stock" },
  { symbol: "WMT", name: "Walmart Inc.", kind: "stock" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", kind: "stock" },
  { symbol: "V", name: "Visa Inc.", kind: "stock" },
  { symbol: "MA", name: "Mastercard Inc.", kind: "stock" },
  { symbol: "NKE", name: "Nike Inc.", kind: "stock" },
  { symbol: "SBUX", name: "Starbucks Corporation", kind: "stock" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", kind: "etf" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", kind: "etf" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", kind: "etf" },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", kind: "etf" },
  { symbol: "IVV", name: "iShares Core S&P 500 ETF", kind: "etf" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", kind: "etf" },
  { symbol: "ARKK", name: "ARK Innovation ETF", kind: "etf" },
  { symbol: "GLD", name: "SPDR Gold Shares", kind: "etf" },
  { symbol: "XLK", name: "Technology Select Sector SPDR Fund", kind: "etf" },
  { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", kind: "etf" },
];

interface YahooSearchResult {
  quotes: Array<{
    symbol: string;
    shortname?: string;
    longname?: string;
    quoteType: string;
  }>;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);

  const commodityResults = searchCommodities(q).map((c) => ({
    symbol: c.symbol,
    name: c.name,
    kind: "commodity" as const,
  }));
  const indexResults = searchIndices(q).map((i) => ({
    symbol: i.symbol,
    name: i.name,
    kind: "index" as const,
  }));
  const localResults = [...indexResults, ...commodityResults];

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    const data = (await res.json()) as YahooSearchResult;
    const results = data.quotes
      .filter(
        (r) =>
          (r.quoteType === "EQUITY" || r.quoteType === "ETF" || r.quoteType === "INDEX") &&
          // Indices we already list under a friendly alias (^IXIC -> NASDAQ) would show twice
          !(r.quoteType === "INDEX" && getIndexByYahooSymbol(r.symbol)),
      )
      .map((r) => ({
        symbol: r.symbol,
        name: r.longname ?? r.shortname ?? r.symbol,
        kind:
          r.quoteType === "ETF"
            ? ("etf" as const)
            : r.quoteType === "INDEX"
              ? ("index" as const)
              : ("stock" as const),
      }));
    return NextResponse.json([...localResults, ...results]);
  } catch {
    const upper = q.toUpperCase();
    const results = FALLBACK_SYMBOLS.filter(
      (s) => s.symbol.includes(upper) || s.name.toUpperCase().includes(upper),
    );
    return NextResponse.json([...localResults, ...results]);
  }
}
