"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "sma"
  | "rsi"
  | "macd"
  | "volume"
  | "sr";

export type DrawingTool = "cursor" | "hline" | "trendline" | "measure" | "text" | "eraser";

export type Theme = "dark" | "light";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
}

export interface TrendPoint {
  time: number;
  price: number;
}

export type TrendLineExtend = "none" | "left" | "right" | "both";

export interface TrendLine {
  id: string;
  symbol: string;
  a: TrendPoint;
  b: TrendPoint;
  color: string;
  extend: TrendLineExtend;
}

export const TRENDLINE_COLORS = [
  "#2962ff",
  "#ef5350",
  "#26a69a",
  "#ffb74d",
  "#ab47bc",
  "#d1d4dc",
];
export const DEFAULT_TRENDLINE_COLOR = TRENDLINE_COLORS[0];

export interface TextAnnotation {
  id: string;
  symbol: string;
  time: number;
  price: number;
  text: string;
}

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema200: number;
  sma: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  srLookback: number;
  srLevels: number;
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  sma: 20,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  srLookback: 5,
  srLevels: 4,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
  ema200: "#ab47bc",
  sma: "#00bcd4",
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  sr: "#26a69a",
};

export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "MATICUSDT",
  "AAPL",
];

export interface WatchlistSection {
  id: string;
  name: string;
  symbols: string[];
  collapsed: boolean;
}

export interface WatchlistDoc {
  id: string;
  name: string;
  sections: WatchlistSection[];
}

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function makeWatchlist(name: string): WatchlistDoc {
  return {
    id: genId(),
    name,
    sections: [{ id: genId(), name: "General", symbols: [], collapsed: false }],
  };
}

const DEFAULT_WATCHLIST_DOC: WatchlistDoc = {
  id: "default",
  name: "Watchlist",
  sections: [
    { id: "general", name: "General", symbols: DEFAULT_WATCHLIST, collapsed: false },
  ],
};

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  watchlists: WatchlistDoc[];
  activeWatchlistId: string;
  /** Free-text notes keyed by symbol (only symbols with a non-empty note are present) */
  notes: Record<string, string>;

  /** Snap drawing points to the nearest candle's O/H/L/C */
  magnetMode: boolean;
  theme: Theme;

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  trendLines: TrendLine[];
  selectedTrendLineId: string | null;
  textAnnotations: TextAnnotation[];
  symbolDialogOpen: boolean;
  /** Section a symbol picked in the add-symbol dialog should land in (null = active list's first section) */
  addSymbolTargetSection: string | null;
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;
  /** Bumped to signal the chart should capture and download a screenshot */
  screenshotRequestId: number;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  setActiveWatchlist: (id: string) => void;
  createWatchlist: (name: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  createSection: (watchlistId: string, name: string) => void;
  renameSection: (watchlistId: string, sectionId: string, name: string) => void;
  deleteSection: (watchlistId: string, sectionId: string) => void;
  toggleSectionCollapsed: (watchlistId: string, sectionId: string) => void;
  addToWatchlist: (s: string, sectionId?: string) => void;
  removeFromWatchlist: (s: string) => void;
  reorderSymbol: (watchlistId: string, sectionId: string, fromIndex: number, toIndex: number) => void;
  setSectionSymbols: (watchlistId: string, sectionId: string, symbols: string[]) => void;
  setTool: (t: DrawingTool) => void;
  toggleMagnet: () => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;
  addTrendLine: (a: TrendPoint, b: TrendPoint, symbol: string) => void;
  updateTrendLine: (
    id: string,
    patch: Partial<Pick<TrendLine, "a" | "b" | "color" | "extend">>,
  ) => void;
  removeTrendLine: (id: string) => void;
  clearTrendLines: (symbol?: string) => void;
  setSelectedTrendLineId: (id: string | null) => void;
  addTextAnnotation: (time: number, price: number, text: string, symbol: string) => void;
  clearTextAnnotations: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setAddSymbolTargetSection: (id: string | null) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
  setNote: (symbol: string, text: string) => void;
  requestScreenshot: () => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,
      indicators: {
        ema20: true,
        ema50: true,
        ema200: false,
        sma: false,
        rsi: true,
        macd: false,
        volume: true,
        sr: false,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        sma: false,
        rsi: false,
        macd: false,
        volume: false,
        sr: false,
      },
      config: { ...DEFAULT_CONFIG },
      watchlists: [DEFAULT_WATCHLIST_DOC],
      activeWatchlistId: DEFAULT_WATCHLIST_DOC.id,
      notes: {},
      magnetMode: false,
      theme: "dark",
      tool: "cursor",
      priceLines: [],
      trendLines: [],
      selectedTrendLineId: null,
      textAnnotations: [],
      symbolDialogOpen: false,
      addSymbolTargetSection: null,
      settingsTarget: null,
      screenshotRequestId: 0,

      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
          // When re-adding, ensure not hidden
          hidden: !s.indicators[key]
            ? { ...s.hidden, [key]: false }
            : s.hidden,
        })),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      setActiveWatchlist: (id) => set({ activeWatchlistId: id }),
      createWatchlist: (name) =>
        set((state) => {
          const doc = makeWatchlist(name.trim() || `Lista ${state.watchlists.length + 1}`);
          return {
            watchlists: [...state.watchlists, doc],
            activeWatchlistId: doc.id,
          };
        }),
      renameWatchlist: (id, name) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === id && name.trim() ? { ...w, name: name.trim() } : w,
          ),
        })),
      deleteWatchlist: (id) =>
        set((state) => {
          if (state.watchlists.length <= 1) return state;
          const watchlists = state.watchlists.filter((w) => w.id !== id);
          const activeWatchlistId =
            state.activeWatchlistId === id ? watchlists[0].id : state.activeWatchlistId;
          return { watchlists, activeWatchlistId };
        }),
      createSection: (watchlistId, name) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId
              ? {
                  ...w,
                  sections: [
                    ...w.sections,
                    {
                      id: genId(),
                      name: name.trim() || `Sección ${w.sections.length + 1}`,
                      symbols: [],
                      collapsed: false,
                    },
                  ],
                }
              : w,
          ),
        })),
      renameSection: (watchlistId, sectionId, name) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId
              ? {
                  ...w,
                  sections: w.sections.map((sec) =>
                    sec.id === sectionId && name.trim()
                      ? { ...sec, name: name.trim() }
                      : sec,
                  ),
                }
              : w,
          ),
        })),
      deleteSection: (watchlistId, sectionId) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId || w.sections.length <= 1) return w;
            const target = w.sections.find((sec) => sec.id === sectionId);
            if (!target) return w;
            const remaining = w.sections.filter((sec) => sec.id !== sectionId);
            remaining[0] = {
              ...remaining[0],
              symbols: [...remaining[0].symbols, ...target.symbols.filter((s) => !remaining[0].symbols.includes(s))],
            };
            return { ...w, sections: remaining };
          }),
        })),
      toggleSectionCollapsed: (watchlistId, sectionId) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId
              ? {
                  ...w,
                  sections: w.sections.map((sec) =>
                    sec.id === sectionId ? { ...sec, collapsed: !sec.collapsed } : sec,
                  ),
                }
              : w,
          ),
        })),
      addToWatchlist: (s, sectionId) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== state.activeWatchlistId) return w;
            if (w.sections.some((sec) => sec.symbols.includes(s))) return w;
            const targetId = sectionId ?? state.addSymbolTargetSection ?? w.sections[0].id;
            return {
              ...w,
              sections: w.sections.map((sec) =>
                sec.id === targetId ? { ...sec, symbols: [...sec.symbols, s] } : sec,
              ),
            };
          }),
        })),
      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id !== state.activeWatchlistId
              ? w
              : {
                  ...w,
                  sections: w.sections.map((sec) => ({
                    ...sec,
                    symbols: sec.symbols.filter((x) => x !== s),
                  })),
                },
          ),
        })),
      reorderSymbol: (watchlistId, sectionId, fromIndex, toIndex) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            return {
              ...w,
              sections: w.sections.map((sec) => {
                if (sec.id !== sectionId) return sec;
                if (
                  fromIndex < 0 ||
                  fromIndex >= sec.symbols.length ||
                  toIndex < 0 ||
                  toIndex >= sec.symbols.length ||
                  fromIndex === toIndex
                )
                  return sec;
                const symbols = [...sec.symbols];
                const [moved] = symbols.splice(fromIndex, 1);
                symbols.splice(toIndex, 0, moved);
                return { ...sec, symbols };
              }),
            };
          }),
        })),
      setSectionSymbols: (watchlistId, sectionId, symbols) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            return {
              ...w,
              sections: w.sections.map((sec) =>
                sec.id === sectionId ? { ...sec, symbols } : sec,
              ),
            };
          }),
        })),
      setTool: (tool) => set({ tool }),
      toggleMagnet: () => set((state) => ({ magnetMode: !state.magnetMode })),
      addPriceLine: (price, symbol) =>
        set((state) => ({
          priceLines: [
            ...state.priceLines,
            {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
              symbol,
              price,
            },
          ],
        })),
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      addTrendLine: (a, b, symbol) =>
        set((state) => ({
          trendLines: [
            ...state.trendLines,
            { id: genId(), symbol, a, b, color: DEFAULT_TRENDLINE_COLOR, extend: "none" },
          ],
        })),
      updateTrendLine: (id, patch) =>
        set((state) => ({
          trendLines: state.trendLines.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removeTrendLine: (id) =>
        set((state) => ({
          trendLines: state.trendLines.filter((t) => t.id !== id),
          selectedTrendLineId: state.selectedTrendLineId === id ? null : state.selectedTrendLineId,
        })),
      clearTrendLines: (symbol) =>
        set((state) => ({
          trendLines: symbol
            ? state.trendLines.filter((t) => t.symbol !== symbol)
            : [],
          selectedTrendLineId: null,
        })),
      setSelectedTrendLineId: (selectedTrendLineId) => set({ selectedTrendLineId }),
      addTextAnnotation: (time, price, text, symbol) =>
        set((state) => ({
          textAnnotations: [...state.textAnnotations, { id: genId(), symbol, time, price, text }],
        })),
      clearTextAnnotations: (symbol) =>
        set((state) => ({
          textAnnotations: symbol
            ? state.textAnnotations.filter((t) => t.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setAddSymbolTargetSection: (addSymbolTargetSection) => set({ addSymbolTargetSection }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
      setNote: (symbol, text) =>
        set((state) => {
          const trimmed = text.trim();
          const notes = { ...state.notes };
          if (trimmed) notes[symbol] = trimmed;
          else delete notes[symbol];
          return { notes };
        }),
      requestScreenshot: () =>
        set((state) => ({ screenshotRequestId: state.screenshotRequestId + 1 })),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "tv-gratis-chart-state",
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown>;
        if (Array.isArray(state.watchlist) && !Array.isArray(state.watchlists)) {
          const doc: WatchlistDoc = {
            id: "default",
            name: "Watchlist",
            sections: [
              {
                id: "general",
                name: "General",
                symbols: state.watchlist as string[],
                collapsed: false,
              },
            ],
          };
          state.watchlists = [doc];
          state.activeWatchlistId = doc.id;
          delete state.watchlist;
        }
        return state;
      },
      // Shallow `persist` merge would fully replace nested objects (indicators/hidden/config)
      // with whatever was last saved, so keys added after a user's first save (e.g. a new
      // indicator) come back `undefined` instead of falling back to the current default.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ChartState> | undefined;
        return {
          ...currentState,
          ...persisted,
          indicators: { ...currentState.indicators, ...persisted?.indicators },
          hidden: { ...currentState.hidden, ...persisted?.hidden },
          config: { ...currentState.config, ...persisted?.config },
        };
      },
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlists: s.watchlists,
        activeWatchlistId: s.activeWatchlistId,
        notes: s.notes,
        magnetMode: s.magnetMode,
        theme: s.theme,
      }),
    },
  ),
);
