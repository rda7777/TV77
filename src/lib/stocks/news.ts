export interface NewsItem {
  id: string;
  /** Headline, translated to Spanish when possible */
  title: string;
  /** The untranslated headline, when `title` is a translation */
  originalTitle?: string;
  publisher: string;
  link: string;
  /** Publish time, unix seconds */
  time: number;
}

export const NEWS_COLOR = "#9c27b0";

export async function fetchStockNews(symbol: string): Promise<NewsItem[]> {
  const res = await fetch(`/api/stocks/news?symbol=${encodeURIComponent(symbol)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`stock news ${res.status}`);
  return (await res.json()) as NewsItem[];
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** "hace 5 minutos", "hace 1 hora", "ayer"… */
export function timeAgo(time: number, now = Date.now() / 1000): string {
  const diff = Math.max(0, now - time);
  if (diff < 60) return "ahora";
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), "hour");
  if (diff < 30 * 86400) return rtf.format(-Math.floor(diff / 86400), "day");
  return new Date(time * 1000).toLocaleDateString("es-AR");
}
