// Server-side helper: translates short texts (news headlines) to Spanish with free public
// endpoints. Never throws — anything that can't be translated comes back unchanged.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const MAX_CACHE = 5000;

// Headlines never change, so a translation is cached for the life of the server
const cache = new Map<string, string>();

/** Google's Chrome-extension endpoint: batches many texts per request, no key needed */
async function googleBatch(texts: string[]): Promise<string[] | null> {
  const params = new URLSearchParams({ client: "dict-chrome-ex", sl: "auto", tl: "es" });
  for (const t of texts) params.append("q", t);
  try {
    const res = await fetch(`https://clients5.google.com/translate_a/t?${params}`, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length !== texts.length) return null;
    // One text → ["traducción", "en"] per item; a single text may come back as a bare string
    return data.map((d) => (Array.isArray(d) ? String(d[0]) : String(d)));
  } catch {
    return null;
  }
}

/** MyMemory: one text per request and a small anonymous daily quota — only a fallback */
async function myMemory(text: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ q: text, langpair: "en|es" });
    const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { responseStatus: number; responseData?: { translatedText?: string } };
    const out = data.responseData?.translatedText;
    return data.responseStatus === 200 && out && !out.startsWith("MYMEMORY WARNING") ? out : null;
  } catch {
    return null;
  }
}

export async function translateToSpanish(texts: string[]): Promise<string[]> {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
  if (missing.length > 0) {
    const google = await googleBatch(missing);
    const results = google ?? (await Promise.all(missing.map(myMemory)));
    missing.forEach((t, i) => {
      const tr = results[i];
      if (tr) cache.set(t, tr);
    });
    // Oldest entries go first once the cache is full (Map keeps insertion order)
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  }
  return texts.map((t) => cache.get(t) ?? t);
}
