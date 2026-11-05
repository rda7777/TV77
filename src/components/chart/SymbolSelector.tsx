"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { fetchStockNote, searchStockSymbols } from "@/lib/stocks/rest";
import { DOLLAR_NOTES } from "@/lib/stocks/dollars";
import { FIRST_EAGLE_NOTES } from "@/lib/store/first-eagle";
import { STOCK_NOTES } from "@/lib/store/stock-notes";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

interface Result {
  symbol: string;
  label: string;
  market: "crypto" | "stock" | "etf" | "commodity" | "index" | "currency";
}

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const addTargetSection = useChartStore((s) => s.addSymbolTargetSection);
  const targetSectionName = useChartStore((s) =>
    s.addSymbolTargetSection
      ? (s.watchlists
          .find((w) => w.id === s.activeWatchlistId)
          ?.sections.find((sec) => sec.id === s.addSymbolTargetSection)?.name ?? null)
      : null,
  );
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");

  /** Seeds a short "what the company does" note for a stock that has none */
  function addDescriptionNote(s: string) {
    const { notes, setNote } = useChartStore.getState();
    if (notes[s]) return;
    const known = STOCK_NOTES[s] ?? FIRST_EAGLE_NOTES[s] ?? DOLLAR_NOTES[s];
    if (known) {
      setNote(s, known);
      return;
    }
    fetchStockNote(s).then((note) => {
      // The user may have written their own note while the description was loading
      if (note && !useChartStore.getState().notes[s]) setNote(s, note);
    });
  }
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);
  const [stockResults, setStockResults] = useState<Result[]>([]);

  useEffect(() => {
    if (open && allSymbols.length === 0) {
      fetchExchangeSymbols().then(setAllSymbols).catch(console.error);
    }
  }, [open, allSymbols.length]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setStockResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchStockSymbols(q)
        .then((results) =>
          setStockResults(
            results.map((r) => ({ symbol: r.symbol, label: r.name, market: r.kind })),
          ),
        )
        .catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const cryptoResults: Result[] = (
      q
        ? allSymbols.filter(
            (s) =>
              s.symbol.includes(q) ||
              s.baseAsset.includes(q) ||
              s.quoteAsset.includes(q),
          )
        : allSymbols.slice(0, 100)
    ).map((s) => ({
      symbol: s.symbol,
      label: `${s.baseAsset} / ${s.quoteAsset}`,
      market: "crypto" as const,
    }));
    return [...cryptoResults, ...stockResults].slice(0, 100);
  }, [query, allSymbols, stockResults]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-base font-semibold hover:bg-tv-panel-hover">
        <Search className="h-4 w-4 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-4 w-4 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden bg-tv-panel p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-tv-border px-5 py-4">
          <DialogTitle className="truncate pr-8 text-lg font-semibold">
            {targetSectionName ? `Agregar a ${targetSectionName}` : "Buscar símbolo"}
          </DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-tv-text-muted" />
            <Input
              autoFocus
              placeholder="BTC, AAPL, NASDAQ…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 bg-tv-bg pl-10 text-base md:text-base"
            />
          </div>
        </div>
        <ScrollArea className="h-[min(480px,60vh)]">
          <div className="flex min-w-0 flex-col">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={`${s.market}-${s.symbol}`}
                onClick={() => {
                  setSymbol(s.symbol);
                  if (addTargetSection) {
                    addToWatchlist(s.symbol, addTargetSection);
                    if (s.market !== "crypto") addDescriptionNote(s.symbol);
                  }
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full min-w-0 items-center justify-between gap-3 border-b border-tv-border px-5 py-3 text-left hover:bg-tv-panel-hover",
                  s.symbol === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-base font-semibold text-tv-text">{s.symbol}</span>
                  <span className="truncate text-sm text-tv-text-muted">{s.label}</span>
                </div>
                <span className="shrink-0 rounded bg-tv-bg px-2 py-1 text-xs font-medium uppercase text-tv-text-dim">
                  {s.market === "crypto"
                    ? "Cripto"
                    : s.market === "etf"
                      ? "ETF"
                      : s.market === "commodity"
                        ? "Materia prima"
                        : s.market === "index"
                          ? "Índice"
                          : s.market === "currency"
                            ? "Dólar"
                          : "Stock"}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
