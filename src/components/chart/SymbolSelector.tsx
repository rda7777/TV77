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
import { searchStockSymbols } from "@/lib/stocks/rest";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

interface Result {
  symbol: string;
  label: string;
  market: "crypto" | "stock" | "etf" | "commodity";
}

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
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
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Buscar símbolo</DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, ETH, AAPL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={`${s.market}-${s.symbol}`}
                onClick={() => {
                  setSymbol(s.symbol);
                  addToWatchlist(s.symbol);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.symbol === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-tv-text">{s.symbol}</span>
                  <span className="truncate text-tv-text-muted">{s.label}</span>
                </div>
                <span className="shrink-0 rounded bg-tv-bg px-1.5 py-0.5 text-[10px] uppercase text-tv-text-dim">
                  {s.market === "crypto"
                    ? "Cripto"
                    : s.market === "etf"
                      ? "ETF"
                      : s.market === "commodity"
                        ? "Materia prima"
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
