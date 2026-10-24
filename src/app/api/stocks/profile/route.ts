import { NextRequest, NextResponse } from "next/server";
import { toYahooSymbol } from "@/lib/stocks/commodities";
import { translateToSpanish } from "@/lib/stocks/translate";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
// About three lines of the watchlist's note dialog
const MAX_NOTE = 130;

// Yahoo's sector names, in the wording the hand-written watchlist notes use
const SECTORS_ES: Record<string, string> = {
  Technology: "Tecnología",
  Healthcare: "Salud",
  "Financial Services": "Financiero",
  "Consumer Cyclical": "Consumo discrecional",
  "Consumer Defensive": "Consumo básico",
  Energy: "Energía",
  Industrials: "Industrial",
  "Basic Materials": "Materiales",
  Utilities: "Servicios públicos",
  "Real Estate": "Inmobiliario",
  "Communication Services": "Comunicaciones",
};

interface YahooProfile {
  quoteSummary: {
    result: Array<{
      assetProfile?: { sector?: string; industry?: string; longBusinessSummary?: string };
      quoteType?: { longName?: string; shortName?: string };
    }> | null;
  };
}

// Yahoo's quoteSummary needs a session cookie plus a matching "crumb"; one pair serves every request
let session: { cookie: string; crumb: string } | null = null;

async function getSession() {
  if (session) return session;
  const res = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, cache: "no-store" });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    cache: "no-store",
  });
  const crumb = (await crumbRes.text()).trim();
  if (!cookie || !crumbRes.ok || !crumb || crumb.includes(" ")) throw new Error("yahoo session");
  session = { cookie, crumb };
  return session;
}

async function fetchProfile(yahooSymbol: string, retry = true): Promise<YahooProfile | null> {
  const { cookie, crumb } = await getSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    yahooSymbol,
  )}?modules=assetProfile,quoteType&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie }, cache: "no-store" });
  if (res.status === 401 && retry) {
    // The crumb expired — get a fresh pair once
    session = null;
    return fetchProfile(yahooSymbol, false);
  }
  if (!res.ok) return null;
  return (await res.json()) as YahooProfile;
}

/** Splits a summary into sentences without breaking on "Inc.", "U.S." and the like */
function sentences(text: string): string[] {
  return text
    .split(/(?<!\b(?:Inc|Corp|Ltd|Co|Cos|plc|N\.V|S\.A|U\.S|U\.K|L\.P|No|St|vs))\.\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cuts a note at the last whole word that fits in MAX_NOTE */
function clamp(note: string): string {
  if (note.length <= MAX_NOTE) return note;
  return `${note.slice(0, MAX_NOTE).replace(/\s+\S*$/, "").replace(/[,;:]$/, "")}…`;
}

/**
 * Fund summaries are mostly legal boilerplate ("The fund generally will invest at least 80%…"),
 * so a fund's note is its name plus what its index follows, when the summary says so.
 */
async function fundNote(name: string, summary: string[]): Promise<string> {
  const tracked = summary
    .map((s) => /(?:designed to (?:measure|track)|to reflect) .*?performance of (.+)/.exec(s)?.[1])
    .find(Boolean);
  if (!tracked) return clamp(`ETF — ${name}.`);
  const [translated] = await translateToSpanish([tracked.replace(/(, less .*)?\.?$/, "")]);
  const text = translated.replace(/[.…\s]+$/, "");
  return clamp(`ETF — ${name}: sigue ${text.charAt(0).toLowerCase()}${text.slice(1)}.`);
}

/**
 * A one-line Spanish description of a stock/ETF ("Sector — what it does"), meant to be seeded
 * as the watchlist note when the symbol is added. `note` is null when Yahoo has no profile.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }
  try {
    const data = await fetchProfile(toYahooSymbol(symbol));
    const result = data?.quoteSummary.result?.[0];
    const profile = result?.assetProfile;
    const all = sentences(profile?.longBusinessSummary ?? "");
    if (all.length === 0) return NextResponse.json({ note: null });

    if (!profile?.sector) {
      const name = result?.quoteType?.longName ?? result?.quoteType?.shortName ?? symbol;
      return NextResponse.json({ note: await fundNote(name, all) });
    }
    const [translated] = await translateToSpanish([all[0]]);
    const sector = SECTORS_ES[profile.sector] ?? profile.sector;
    return NextResponse.json({ note: clamp(`${sector} — ${translated.replace(/[.…\s]+$/, "")}.`) });
  } catch {
    return NextResponse.json({ note: null });
  }
}
