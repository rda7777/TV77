"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, Check, ChevronDown, ChevronRight, GripVertical, MoreVertical, Plus, StickyNote, X } from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { fetchStockQuotes } from "@/lib/stocks/rest";
import { getMarketType, getLogoUrl } from "@/lib/market";
import { useChartStore } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const STOCK_POLL_MS = 3000;

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

type PromptMode =
  | { kind: "create-list" }
  | { kind: "rename-list"; watchlistId: string; initial: string }
  | { kind: "create-section"; watchlistId: string }
  | { kind: "rename-section"; watchlistId: string; sectionId: string; initial: string };

export function Watchlist() {
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const activeList = useMemo(
    () => watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0],
    [watchlists, activeWatchlistId],
  );
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const setAddSymbolTargetSection = useChartStore((s) => s.setAddSymbolTargetSection);
  const setActiveWatchlist = useChartStore((s) => s.setActiveWatchlist);
  const createWatchlist = useChartStore((s) => s.createWatchlist);
  const renameWatchlist = useChartStore((s) => s.renameWatchlist);
  const deleteWatchlist = useChartStore((s) => s.deleteWatchlist);
  const createSection = useChartStore((s) => s.createSection);
  const renameSection = useChartStore((s) => s.renameSection);
  const deleteSection = useChartStore((s) => s.deleteSection);
  const toggleSectionCollapsed = useChartStore((s) => s.toggleSectionCollapsed);
  const notes = useChartStore((s) => s.notes);
  const setNote = useChartStore((s) => s.setNote);
  const reorderSymbol = useChartStore((s) => s.reorderSymbol);
  const moveSymbolToSection = useChartStore((s) => s.moveSymbolToSection);
  const setSectionSymbols = useChartStore((s) => s.setSectionSymbols);

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [prompt, setPrompt] = useState<PromptMode | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [noteTarget, setNoteTarget] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [dragItem, setDragItem] = useState<{
    sectionId: string;
    index: number;
    symbol: string;
  } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<{ sectionId: string; index: number } | null>(
    null,
  );
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  const allSymbols = useMemo(
    () => activeList?.sections.flatMap((sec) => sec.symbols) ?? [],
    [activeList],
  );

  useEffect(() => {
    if (allSymbols.length === 0) return;
    let cancelled = false;

    function updateRow(symbol: string, price: number, pct: number) {
      setRows((prev) => {
        const prevRow = prev[symbol];
        if (prevRow) {
          if (price > prevRow.price) {
            setFlash((f) => ({ ...f, [symbol]: "up" }));
            setTimeout(() => setFlash((f) => ({ ...f, [symbol]: null })), 300);
          } else if (price < prevRow.price) {
            setFlash((f) => ({ ...f, [symbol]: "down" }));
            setTimeout(() => setFlash((f) => ({ ...f, [symbol]: null })), 300);
          }
        }
        return { ...prev, [symbol]: { symbol, price, pct } };
      });
    }

    const cryptoSymbols = allSymbols.filter((s) => getMarketType(s) === "crypto");
    const stockSymbols = allSymbols.filter((s) => getMarketType(s) === "stock");

    let unsubWs: (() => void) | null = null;
    let stockPollTimer: ReturnType<typeof setInterval> | null = null;

    if (cryptoSymbols.length > 0) {
      fetchTickers24h(cryptoSymbols)
        .then((tickers) => {
          if (cancelled) return;
          tickers.forEach((t) => updateRow(t.symbol, t.lastPrice, t.priceChangePercent));
        })
        .catch(console.error);

      const ws = getBinanceWS();
      unsubWs = ws.subscribeMiniTickers(cryptoSymbols, (tick) => {
        updateRow(tick.symbol, tick.close, tick.pct);
      });
    }

    // No free real-time stream for stocks — poll quotes fast while the tab is visible
    let stockInFlight = false;
    const pollStocks = () => {
      if (stockInFlight || document.hidden) return;
      stockInFlight = true;
      fetchStockQuotes(stockSymbols)
        .then((quotes) => {
          if (cancelled) return;
          quotes.forEach((q) => updateRow(q.symbol, q.lastPrice, q.priceChangePercent));
        })
        .catch(console.error)
        .finally(() => {
          stockInFlight = false;
        });
    };
    if (stockSymbols.length > 0) {
      pollStocks();
      stockPollTimer = setInterval(pollStocks, STOCK_POLL_MS);
      document.addEventListener("visibilitychange", pollStocks);
    }

    return () => {
      cancelled = true;
      if (unsubWs) unsubWs();
      if (stockPollTimer) clearInterval(stockPollTimer);
      document.removeEventListener("visibilitychange", pollStocks);
    };
  }, [allSymbols]);

  if (!activeList) return null;

  function handleDrop(targetSectionId: string, targetIndex: number) {
    if (!dragItem) return;
    if (dragItem.sectionId === targetSectionId) {
      reorderSymbol(activeList.id, targetSectionId, dragItem.index, targetIndex);
    } else {
      moveSymbolToSection(
        activeList.id,
        dragItem.sectionId,
        targetSectionId,
        dragItem.symbol,
        targetIndex,
      );
    }
    setDragItem(null);
    setDragOverIndex(null);
    setDragOverSection(null);
  }

  function openPrompt(mode: PromptMode) {
    setPromptValue(
      mode.kind === "rename-list" || mode.kind === "rename-section" ? mode.initial : "",
    );
    setPrompt(mode);
  }

  function submitPrompt() {
    if (!prompt) return;
    if (prompt.kind === "create-list") createWatchlist(promptValue);
    else if (prompt.kind === "rename-list") renameWatchlist(prompt.watchlistId, promptValue);
    else if (prompt.kind === "create-section") createSection(prompt.watchlistId, promptValue);
    else if (prompt.kind === "rename-section")
      renameSection(prompt.watchlistId, prompt.sectionId, promptValue);
    setPrompt(null);
  }

  function displayName(s: string): string {
    return getMarketType(s) === "crypto" ? s.replace("USDT", "") : s;
  }

  function sortSection(
    sectionId: string,
    key: "name-asc" | "name-desc" | "price-desc" | "price-asc" | "pct-desc" | "pct-asc",
  ) {
    const section = activeList.sections.find((sec) => sec.id === sectionId);
    if (!section) return;
    const sorted = [...section.symbols].sort((a, b) => {
      switch (key) {
        case "name-asc":
          return displayName(a).localeCompare(displayName(b));
        case "name-desc":
          return displayName(b).localeCompare(displayName(a));
        case "price-desc":
          return (rows[b]?.price ?? -Infinity) - (rows[a]?.price ?? -Infinity);
        case "price-asc":
          return (rows[a]?.price ?? Infinity) - (rows[b]?.price ?? Infinity);
        case "pct-desc":
          return (rows[b]?.pct ?? -Infinity) - (rows[a]?.pct ?? -Infinity);
        case "pct-asc":
          return (rows[a]?.pct ?? Infinity) - (rows[b]?.pct ?? Infinity);
      }
    });
    setSectionSymbols(activeList.id, sectionId, sorted);
  }

  const promptTitle = {
    "create-list": "Nueva lista",
    "rename-list": "Renombrar lista",
    "create-section": "Nueva sección",
    "rename-section": "Renombrar sección",
  }[prompt?.kind ?? "create-list"];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text">
            <span className="max-w-[140px] truncate">{activeList.name}</span>
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-tv-panel">
            {watchlists.map((w) => (
              <DropdownMenuItem
                key={w.id}
                closeOnClick
                onClick={() => setActiveWatchlist(w.id)}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate">{w.name}</span>
                {w.id === activeWatchlistId && <Check className="h-3.5 w-3.5 text-tv-blue" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => openPrompt({ kind: "create-list" })}
              className="text-xs"
            >
              + Nueva lista
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setAddSymbolTargetSection(activeList.sections[0].id);
              openSymbolDialog(true);
            }}
            className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            title="Agregar símbolo"
            aria-label="Agregar al watchlist"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              aria-label="Opciones de lista"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-tv-panel">
              <DropdownMenuItem
                onClick={() => openPrompt({ kind: "create-section", watchlistId: activeList.id })}
                className="text-xs"
              >
                Nueva sección
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  openPrompt({
                    kind: "rename-list",
                    watchlistId: activeList.id,
                    initial: activeList.name,
                  })
                }
                className="text-xs"
              >
                Renombrar lista
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={watchlists.length <= 1}
                onClick={() => deleteWatchlist(activeList.id)}
                variant="destructive"
                className="text-xs"
              >
                Eliminar lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span className="w-3" />
        <span>Símbolo</span>
        <span className="text-right">Precio</span>
        <span className="text-right">24h</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          {activeList.sections.map((section) => (
            <div
              key={section.id}
              onDragOver={(e) => {
                if (!dragItem) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragItem.sectionId !== section.id) setDragOverSection(section.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(section.id, section.symbols.length);
              }}
              onDragLeave={() => {
                setDragOverSection((cur) => (cur === section.id ? null : cur));
              }}
            >
              <div
                className={cn(
                  "group/section flex items-center justify-between border-b border-tv-border bg-tv-panel px-3 py-1 text-[10px]",
                  dragOverSection === section.id && "bg-tv-blue/10",
                )}
              >
                <button
                  onClick={() => toggleSectionCollapsed(activeList.id, section.id)}
                  className="flex items-center gap-1 text-tv-text-muted hover:text-tv-text"
                >
                  {section.collapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  <span className="font-semibold uppercase tracking-wider">{section.name}</span>
                  <span className="text-tv-text-dim">({section.symbols.length})</span>
                </button>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => {
                      setAddSymbolTargetSection(section.id);
                      openSymbolDialog(true);
                    }}
                    className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text group-hover/section:visible"
                    aria-label={`Agregar símbolo a ${section.name}`}
                    title="Agregar símbolo aquí"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text group-hover/section:visible"
                      aria-label={`Opciones de sección ${section.name}`}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 bg-tv-panel">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs">
                          <ArrowDownAZ className="h-3.5 w-3.5" />
                          Ordenar
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="bg-tv-panel">
                          <DropdownMenuItem
                            onClick={() => sortSection(section.id, "name-asc")}
                            className="text-xs"
                          >
                            Nombre A-Z
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => sortSection(section.id, "name-desc")}
                            className="text-xs"
                          >
                            Nombre Z-A
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => sortSection(section.id, "price-desc")}
                            className="text-xs"
                          >
                            Precio: mayor a menor
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => sortSection(section.id, "price-asc")}
                            className="text-xs"
                          >
                            Precio: menor a mayor
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => sortSection(section.id, "pct-desc")}
                            className="text-xs"
                          >
                            24h %: mayor a menor
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => sortSection(section.id, "pct-asc")}
                            className="text-xs"
                          >
                            24h %: menor a mayor
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          openPrompt({
                            kind: "rename-section",
                            watchlistId: activeList.id,
                            sectionId: section.id,
                            initial: section.name,
                          })
                        }
                        className="text-xs"
                      >
                        Renombrar sección
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={activeList.sections.length <= 1}
                        onClick={() => deleteSection(activeList.id, section.id)}
                        variant="destructive"
                        className="text-xs"
                      >
                        Eliminar sección
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {!section.collapsed &&
                section.symbols.map((s, index) => {
                  const row = rows[s];
                  const isActive = s === symbol;
                  const f = flash[s];
                  const isDragging =
                    dragItem?.sectionId === section.id && dragItem.index === index;
                  const isDragOver =
                    dragOverIndex?.sectionId === section.id &&
                    dragOverIndex.index === index &&
                    !isDragging;
                  return (
                    <div
                      key={s}
                      onClick={() => setSymbol(s)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragItem({ sectionId: section.id, index, symbol: s });
                      }}
                      onDragOver={(e) => {
                        if (!dragItem) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverIndex({ sectionId: section.id, index });
                        setDragOverSection(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDrop(section.id, index);
                      }}
                      onDragEnd={() => {
                        setDragItem(null);
                        setDragOverIndex(null);
                        setDragOverSection(null);
                      }}
                      className={cn(
                        "group grid cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                        "hover:bg-tv-panel-hover",
                        isActive && "bg-tv-panel-hover",
                        isDragging && "opacity-40",
                        isDragOver && "border-t-2 border-tv-blue",
                      )}
                    >
                      <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-tv-text-dim opacity-0 group-hover:opacity-100" />
                      <div className="flex items-center gap-2">
                        <img
                          src={getLogoUrl(s)}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-full bg-tv-panel-hover object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        <span className="font-medium text-tv-text">
                          {getMarketType(s) === "crypto" ? s.replace("USDT", "") : s}
                        </span>
                        {getMarketType(s) === "crypto" && (
                          <span className="text-[10px] text-tv-text-dim">USDT</span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-right tabular-nums transition-colors",
                          f === "up" && "text-tv-green",
                          f === "down" && "text-tv-red",
                          !f && "text-tv-text",
                        )}
                      >
                        {row ? formatPrice(row.price) : "—"}
                      </span>
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className={cn(
                            "tabular-nums",
                            row
                              ? row.pct >= 0
                                ? "text-tv-green"
                                : "text-tv-red"
                              : "text-tv-text-muted",
                          )}
                        >
                          {row ? formatPct(row.pct) : "—"}
                        </span>
                        {getMarketType(s) === "stock" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNoteTarget(s);
                              setNoteValue(notes[s] ?? "");
                            }}
                            className={cn(
                              "rounded p-0.5 hover:bg-tv-bg",
                              notes[s]
                                ? "text-tv-yellow"
                                : "invisible text-tv-text-muted hover:text-tv-text group-hover:visible",
                            )}
                            aria-label={
                              notes[s] ? `Editar nota de ${s}` : `Agregar nota a ${s}`
                            }
                            title={notes[s] || "Agregar nota"}
                          >
                            <StickyNote className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(s);
                          }}
                          className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red group-hover:visible"
                          aria-label={`Quitar ${s} del watchlist`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              {!section.collapsed && section.symbols.length === 0 && (
                <div
                  className={cn(
                    "px-3 py-2 text-center text-[11px] text-tv-text-muted",
                    dragOverSection === section.id && "border-t-2 border-tv-blue",
                  )}
                >
                  Sin símbolos
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={prompt !== null} onOpenChange={(v) => !v && setPrompt(null)}>
        <DialogContent className="max-w-xs bg-tv-panel">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{promptTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPrompt();
              }}
              placeholder="Nombre"
              className="bg-tv-bg"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submitPrompt} className="bg-tv-blue hover:bg-tv-blue/90">
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={noteTarget !== null} onOpenChange={(v) => !v && setNoteTarget(null)}>
        <DialogContent className="max-w-sm bg-tv-panel">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Nota — {noteTarget}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <textarea
              autoFocus
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Escribe una nota…"
              rows={4}
              className="w-full resize-none rounded-lg border border-input bg-tv-bg p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="flex justify-between">
              {noteTarget && notes[noteTarget] ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNote(noteTarget, "");
                    setNoteTarget(null);
                  }}
                  className="text-tv-text-muted hover:text-tv-red"
                >
                  Eliminar nota
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={() => {
                  if (noteTarget) setNote(noteTarget, noteValue);
                  setNoteTarget(null);
                }}
                className="bg-tv-blue hover:bg-tv-blue/90"
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
