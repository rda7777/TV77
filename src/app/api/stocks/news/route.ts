import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/stocks/commodities";
import type { NewsItem } from "@/lib/stocks/news";
import { translateToSpanish } from "@/lib/stocks/translate";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const CACHE_TTL_MS = 2 * 60 * 1000;
// Many results are market-wide stories that merely tag the ticker — fetch plenty, keep the relevant ones
const NEWS_COUNT = 50;
const MAX_NEWS = 20;

// Several chart re-mounts / tabs asking for the same symbol within a couple of minutes share one fetch
const cache = new Map<string, { at: number; data: NewsItem[] }>();

interface YahooSearch {
  quotes?: Array<{ symbol?: string; shortname?: string; longname?: string }>;
  news?: Array<{
    uuid: string;
    title: string;
    publisher: string;
    link: string;
    providerPublishTime: number;
    type: string;
    relatedTickers?: string[];
  }>;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }
  const yahooSymbol = toYahooSymbol(symbol);
  const hit = cache.get(yahooSymbol);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return NextResponse.json(hit.data);

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    yahooSymbol,
  )}&quotesCount=1&newsCount=${NEWS_COUNT}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: `yahoo ${res.status}` }, { status: 502 });
  }
  const data = (await res.json()) as YahooSearch;
  const tickers = [yahooSymbol, ...(SHARE_CLASSES[yahooSymbol] ?? [])];
  const quote = data.quotes?.find((q) => q.symbol === yahooSymbol);
  const isAbout = aboutMatcher(symbol, yahooSymbol, quote?.shortname ?? quote?.longname);
  const news: NewsItem[] = (data.news ?? [])
    // The search returns market-wide pieces and press releases that only tag the ticker in
    // passing ("Should You Sell Your Roblox Stock?" for MSFT) — keep stories whose headline
    // names the company, and that are tagged with it (or a sibling share class) when tagged
    .filter(
      (n) =>
        isAbout(n.title) &&
        (!n.relatedTickers?.length || n.relatedTickers.some((t) => tickers.includes(t))),
    )
    .slice(0, MAX_NEWS)
    .map((n) => ({
      id: n.uuid,
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: n.providerPublishTime,
    }))
    .sort((a, b) => b.time - a.time);

  // Headlines come in English — show them in Spanish, keeping the original for reference
  const translated = await translateToSpanish(news.map((n) => n.title));
  news.forEach((n, i) => {
    if (translated[i] !== n.title) {
      n.originalTitle = n.title;
      n.title = translated[i];
    }
  });

  cache.set(yahooSymbol, { at: Date.now(), data: news });
  return NextResponse.json(news);
}

const NAME_SUFFIXES =
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|ag|nv|se|holdings?|group|platforms|class [a-z]|the)\b\.?/gi;
/** First words too generic to identify a company on their own ("Bank" of America…) */
const GENERIC_WORDS = new Set([
  "bank", "first", "american", "general", "united", "national", "international", "global",
  "new", "royal", "china", "energy", "capital", "financial", "digital",
]);
/** Other share classes of the same company — news is often tagged with just one of them */
const SHARE_CLASSES: Record<string, string[]> = {
  GOOGL: ["GOOG"],
  GOOG: ["GOOGL"],
  "BRK-B": ["BRK-A"],
  "BRK-A": ["BRK-B"],
};
/** Brands headlines use instead of the listed company name */
const ALIASES: Record<string, string[]> = {
  GOOG: ["Google"],
  GOOGL: ["Google"],
  META: ["Facebook", "Instagram", "WhatsApp"],
  "BRK-B": ["Berkshire", "Buffett"],
  "BRK-A": ["Berkshire", "Buffett"],
};

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Headline test for "is this story about the symbol": the ticker (case-sensitive, 2+ chars so
 * "V"/"A" don't match everywhere), the company name without legal suffixes, its distinctive
 * first word ("Apple", "Microsoft"), and known brand aliases.
 */
function aboutMatcher(symbol: string, yahooSymbol: string, companyName?: string) {
  const terms: RegExp[] = [];
  for (const t of new Set([symbol, yahooSymbol])) {
    if (t.length >= 2 && /^[A-Z0-9.-]+$/.test(t)) terms.push(new RegExp(`\\b${escapeRe(t)}\\b`));
  }
  const name = (companyName ?? "").replace(NAME_SUFFIXES, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const words = [...(ALIASES[yahooSymbol] ?? [])];
  if (name.length >= 3) words.push(name);
  const first = name.split(" ")[0];
  if (first && first !== name && first.length >= 4 && !GENERIC_WORDS.has(first.toLowerCase())) words.push(first);
  for (const w of words) terms.push(new RegExp(`\\b${escapeRe(w)}`, "i"));
  return (title: string) => terms.some((re) => re.test(title));
}
