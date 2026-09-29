"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type Logical,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { fetchStockKlines, fetchSymbolName } from "@/lib/stocks/rest";
import { getMarketType } from "@/lib/market";
import {
  EVENT_STYLE,
  bucketEventsByCandle,
  describeEvent,
  fetchStockEvents,
  type StockEvent,
  type StockEventsResponse,
} from "@/lib/stocks/events";
import { ema, sma, smaOfPoints, rsi, macd, supportResistance } from "@/lib/indicators";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import { NEWS_COLOR, fetchStockNews, timeAgo, type NewsItem } from "@/lib/stocks/news";
import { cn } from "@/lib/utils";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  DEFAULT_TRENDLINE_COLOR,
  DEFAULT_TRENDLINE_EXTEND,
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
  type TrendPoint,
  type TrendLineExtend,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { TrendLineToolbar } from "./TrendLineToolbar";
import { RectangleToolbar } from "./RectangleToolbar";
import { RectanglePrimitive, type RectangleHit } from "./rectangle-primitive";
import { ArrowToolbar } from "./ArrowToolbar";
import { ArrowPrimitive, type ArrowHit } from "./arrow-primitive";
import { BandPrimitive } from "./band-primitive";
import { TrendLinePrimitive } from "./trendline-primitive";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

interface TrendDraftState {
  phase: "idle" | "placing";
  a: TrendPoint | null;
  b: TrendPoint | null;
}
const INITIAL_TREND_DRAFT: TrendDraftState = { phase: "idle", a: null, b: null };

interface TextDraftState {
  /** Set when editing an existing annotation; absent for a new one */
  id?: string;
  time: number;
  price: number;
  value: string;
}

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** How far (px) a cloned trend line is offset from its original */
const CLONE_OFFSET_PX = 32;

function toExtend(left: boolean, right: boolean): TrendLineExtend {
  if (left && right) return "both";
  if (left) return "left";
  if (right) return "right";
  return "none";
}

/**
 * Price after dragging a drawing by the pointer movement start→cur. On the exponential (log) axis the
 * move is a ratio, so the drawing keeps its on-screen shape; otherwise it's a plain price offset.
 */
function shiftPrice(price: number, start: number, cur: number, exponential: boolean): number {
  return exponential && price > 0 && start > 0 && cur > 0
    ? price * (cur / start)
    : price + (cur - start);
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

// Brand colors — constant across themes
const TV_COLORS = {
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
};

interface ThemePalette {
  bg: string;
  panel: string;
  border: string;
  text: string;
  textMuted: string;
  grid: string;
  /** Fading-momentum MACD histogram bars */
  histWeak: string;
}

const TV_PALETTES: Record<"dark" | "light", ThemePalette> = {
  dark: {
    bg: "#131722",
    panel: "#1e222d",
    border: "#2a2e39",
    text: "#d1d4dc",
    textMuted: "#787b86",
    grid: "#1e222d",
    histWeak: "#d1d4dc",
  },
  light: {
    bg: "#ffffff",
    panel: "#f5f6fa",
    border: "#e0e3eb",
    text: "#131722",
    textMuted: "#5d606b",
    grid: "#f5f6fa",
    histWeak: "#b2b5be",
  },
};

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema150?: number;
  ema200?: number;
  sma?: number;
  rsi?: number;
  rsiMa?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
}

/** Event badges (dividends / splits / earnings) sit this far above the main pane's bottom edge */
const EVENT_STRIP_OFFSET = 12;
const EVENT_BADGE_SIZE = 14;
const NEWS_POLL_MS = 5 * 60 * 1000;
/** RSI-based moving average (TradingView's default: SMA 14 of the RSI) */
const RSI_MA_PERIOD = 14;
const RSI_MA_COLOR = "#fdd835";
const RSI_BAND_COLOR = "rgba(126, 87, 194, 0.1)";
/** MACD histogram: teal/red while momentum builds; fading bars use the theme's `histWeak` */
const MACD_HIST_COLORS = {
  up: "#26a69a",
  down: "#f23645",
};

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const market = getMarketType(symbol);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema150Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const smaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiMaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiLevelsRef = useRef<IPriceLine[]>([]);
  const rsiBandRef = useRef<BandPrimitive | null>(null);
  const macdZeroLineRef = useRef<IPriceLine | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const srPriceLinesRef = useRef<IPriceLine[]>([]);
  const trendPrimitivesRef = useRef<Map<string, TrendLinePrimitive>>(new Map());
  const previewTrendRef = useRef<TrendLinePrimitive | null>(null);
  const rectPrimitivesRef = useRef<Map<string, RectanglePrimitive>>(new Map());
  const previewRectRef = useRef<RectanglePrimitive | null>(null);
  const arrowPrimitivesRef = useRef<Map<string, ArrowPrimitive>>(new Map());
  const previewArrowRef = useRef<ArrowPrimitive | null>(null);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const magnetMode = useChartStore((s) => s.magnetMode);
  const priceLines = useChartStore((s) => s.priceLines);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const trendLines = useChartStore((s) => s.trendLines);
  const addTrendLine = useChartStore((s) => s.addTrendLine);
  const updateTrendLine = useChartStore((s) => s.updateTrendLine);
  const removeTrendLine = useChartStore((s) => s.removeTrendLine);
  const selectedTrendLineId = useChartStore((s) => s.selectedTrendLineId);
  const setSelectedTrendLineId = useChartStore((s) => s.setSelectedTrendLineId);
  const rectangles = useChartStore((s) => s.rectangles);
  const addRectangle = useChartStore((s) => s.addRectangle);
  const updateRectangle = useChartStore((s) => s.updateRectangle);
  const removeRectangle = useChartStore((s) => s.removeRectangle);
  const selectedRectangleId = useChartStore((s) => s.selectedRectangleId);
  const setSelectedRectangleId = useChartStore((s) => s.setSelectedRectangleId);
  const arrows = useChartStore((s) => s.arrows);
  const addArrow = useChartStore((s) => s.addArrow);
  const updateArrow = useChartStore((s) => s.updateArrow);
  const removeArrow = useChartStore((s) => s.removeArrow);
  const selectedArrowId = useChartStore((s) => s.selectedArrowId);
  const setSelectedArrowId = useChartStore((s) => s.setSelectedArrowId);
  const textAnnotations = useChartStore((s) => s.textAnnotations);
  const addTextAnnotation = useChartStore((s) => s.addTextAnnotation);
  const updateTextAnnotation = useChartStore((s) => s.updateTextAnnotation);
  const removeTextAnnotation = useChartStore((s) => s.removeTextAnnotation);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const screenshotRequestId = useChartStore((s) => s.screenshotRequestId);
  const theme = useChartStore((s) => s.theme);
  const scaleMode = useChartStore((s) => s.scaleMode);
  const setScaleMode = useChartStore((s) => s.setScaleMode);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const magnetRef = useRef(magnetMode);
  magnetRef.current = magnetMode;
  const paletteRef = useRef<ThemePalette>(TV_PALETTES[theme]);
  paletteRef.current = TV_PALETTES[theme];
  const scaleModeRef = useRef(scaleMode);
  scaleModeRef.current = scaleMode;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const addTrendLineRef = useRef(addTrendLine);
  addTrendLineRef.current = addTrendLine;
  const trendLinesRef = useRef(trendLines);
  trendLinesRef.current = trendLines;
  const setSelectedTrendLineIdRef = useRef(setSelectedTrendLineId);
  setSelectedTrendLineIdRef.current = setSelectedTrendLineId;
  const addRectangleRef = useRef(addRectangle);
  addRectangleRef.current = addRectangle;
  const rectanglesRef = useRef(rectangles);
  rectanglesRef.current = rectangles;
  const setSelectedRectangleIdRef = useRef(setSelectedRectangleId);
  setSelectedRectangleIdRef.current = setSelectedRectangleId;
  const addArrowRef = useRef(addArrow);
  addArrowRef.current = addArrow;
  const arrowsRef = useRef(arrows);
  arrowsRef.current = arrows;
  const setSelectedArrowIdRef = useRef(setSelectedArrowId);
  setSelectedArrowIdRef.current = setSelectedArrowId;
  const addTextAnnotationRef = useRef(addTextAnnotation);
  addTextAnnotationRef.current = addTextAnnotation;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  const [companyName, setCompanyName] = useState<string | null>(null);
  const eventToggles = useChartStore((s) => s.events);
  const [loadedEvents, setLoadedEvents] = useState<{
    symbol: string;
    data: StockEventsResponse;
  } | null>(null);
  // Derived instead of reset-in-effect: stale events from the previous symbol never render
  const stockEvents =
    market === "stock" && loadedEvents?.symbol === symbol ? loadedEvents.data : null;
  const [loadedNews, setLoadedNews] = useState<{ symbol: string; items: NewsItem[] } | null>(null);
  const stockNews = market === "stock" && loadedNews?.symbol === symbol ? loadedNews.items : null;
  /** News card opened from a lightning badge: the candle it belongs to + "Ver todos" state */
  const [openNews, setOpenNews] = useState<{ time: number; expanded: boolean } | null>(null);
  /** Bumped whenever a fresh candle set is loaded, so event markers re-snap to it */
  const [candlesVersion, setCandlesVersion] = useState(0);
  /** Candle time → visible events on that candle (for the hover tooltip) */
  const eventsByCandleRef = useRef<Map<number, StockEvent[]>>(new Map());
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [trendDraft, setTrendDraft] = useState<TrendDraftState>(INITIAL_TREND_DRAFT);
  const [rectDraft, setRectDraft] = useState<TrendDraftState>(INITIAL_TREND_DRAFT);
  const [arrowDraft, setArrowDraft] = useState<TrendDraftState>(INITIAL_TREND_DRAFT);
  const [textDraft, setTextDraft] = useState<TextDraftState | null>(null);
  const [magnetPoint, setMagnetPoint] = useState<TrendPoint | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const trendDraftRef = useRef(trendDraft);
  trendDraftRef.current = trendDraft;
  const rectDraftRef = useRef(rectDraft);
  rectDraftRef.current = rectDraft;
  const arrowDraftRef = useRef(arrowDraft);
  arrowDraftRef.current = arrowDraft;
  const textDraftRef = useRef(textDraft);
  textDraftRef.current = textDraft;

  // Helper — snap a raw cursor price to the nearest O/H/L/C of the bar at `time` when magnet mode is on
  function snapPrice(time: number, price: number): number {
    if (!magnetRef.current) return price;
    const candle = candlesRef.current.find((c) => c.time === time);
    if (!candle) return price;
    const options = [candle.open, candle.high, candle.low, candle.close];
    return options.reduce((best, v) =>
      Math.abs(v - price) < Math.abs(best - price) ? v : best,
    );
  }

  // Smallest recent spacing between candles ≈ the bar interval (gaps only make spacing bigger)
  function barStep(): number {
    const c = candlesRef.current;
    let step = Infinity;
    for (let i = Math.max(1, c.length - 6); i < c.length; i++) step = Math.min(step, c[i].time - c[i - 1].time);
    return isFinite(step) ? step : 86400;
  }

  // Helper — time → pane x, extrapolating by whole bars into the blank area past the last candle
  // (timeToCoordinate only knows times that have a candle)
  function timeToX(time: number): number | null {
    const chart = chartRef.current;
    const c = candlesRef.current;
    if (!chart) return null;
    const ts = chart.timeScale();
    const direct = ts.timeToCoordinate(time as UTCTimestamp);
    if (direct !== null || c.length === 0) return direct;
    const last = c.length - 1;
    let logical: number;
    if (time > c[last].time) logical = last + (time - c[last].time) / barStep();
    else if (time < c[0].time) logical = (time - c[0].time) / barStep();
    else {
      // Between two candles (e.g. a gap): interpolate their indices
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (c[mid].time <= time) lo = mid;
        else hi = mid;
      }
      logical = lo + (time - c[lo].time) / (c[hi].time - c[lo].time || 1);
    }
    // logicalToCoordinate only handles whole indices (fractions come back as 0) — interpolate
    const i = Math.floor(logical);
    const x0 = ts.logicalToCoordinate(i as Logical);
    const x1 = ts.logicalToCoordinate((i + 1) as Logical);
    if (x0 === null || x1 === null) return null;
    return x0 + (x1 - x0) * (logical - i);
  }
  const timeToXRef = useRef(timeToX);
  timeToXRef.current = timeToX;

  // Helper — pane x → time, snapped to a bar; works past the last candle too
  function xToTime(x: number): number | null {
    const chart = chartRef.current;
    const c = candlesRef.current;
    if (!chart || c.length === 0) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;
    const idx = Math.round(logical);
    const last = c.length - 1;
    if (idx >= 0 && idx <= last) return c[idx].time;
    if (idx > last) return c[last].time + (idx - last) * barStep();
    return c[0].time + idx * barStep();
  }
  const xToTimeRef = useRef(xToTime);
  xToTimeRef.current = xToTime;

  // Helper — topmost trend line (for this symbol) under a chart-relative point
  function hitTestTrendLine(px: number, py: number): string | null {
    const lines = trendLinesRef.current.filter((t) => t.symbol === symbolRef.current);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (trendPrimitivesRef.current.get(lines[i].id)?.hitsPoint(px, py)) return lines[i].id;
    }
    return null;
  }
  const hitTestTrendLineRef = useRef(hitTestTrendLine);
  hitTestTrendLineRef.current = hitTestTrendLine;

  // Helper — viewport pointer → chart (time, price); null when outside the loaded data range
  function pointerToTimePrice(clientX: number, clientY: number): TrendPoint | null {
    const container = containerRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!container || !chart || !series) return null;
    const box = container.getBoundingClientRect();
    const time = chart.timeScale().coordinateToTime(clientX - box.left);
    const price = series.coordinateToPrice(clientY - box.top);
    if (time === null || price === null || !isFinite(price)) return null;
    return { time: Number(time), price };
  }

  // Helper — topmost rectangle (for this symbol) under a chart-relative point
  function hitTestRectangle(x: number, y: number): string | null {
    const rects = rectanglesRef.current.filter((r) => r.symbol === symbolRef.current);
    for (let i = rects.length - 1; i >= 0; i--) {
      if (rectPrimitivesRef.current.get(rects[i].id)?.hitRegion(x, y)) return rects[i].id;
    }
    return null;
  }
  const hitTestRectangleRef = useRef(hitTestRectangle);
  hitTestRectangleRef.current = hitTestRectangle;

  // Helper — topmost arrow (for this symbol) under a chart-relative point
  function hitTestArrow(x: number, y: number): string | null {
    const list = arrowsRef.current.filter((ar) => ar.symbol === symbolRef.current);
    for (let i = list.length - 1; i >= 0; i--) {
      if (arrowPrimitivesRef.current.get(list[i].id)?.hitRegion(x, y)) return list[i].id;
    }
    return null;
  }
  const hitTestArrowRef = useRef(hitTestArrow);
  hitTestArrowRef.current = hitTestArrow;

  // Helper — drag an arrow by its shaft ("body") or move its tail/head ("a"/"b")
  function startDragArrow(e: React.MouseEvent, id: string, hit: ArrowHit) {
    const arrow = arrowsRef.current.find((ar) => ar.id === id);
    const start = pointerToTimePrice(e.clientX, e.clientY);
    if (!arrow || !start) return;
    // Handled here — keep the chart from also starting a pan on this mousedown
    e.stopPropagation();
    e.preventDefault();

    const from: TrendPoint = start;
    const origA = arrow.a;
    const origB = arrow.b;

    function onMove(ev: MouseEvent) {
      const cur = pointerToTimePrice(ev.clientX, ev.clientY);
      if (!cur) return;
      if (hit !== "body") {
        updateArrow(id, { [hit]: { time: cur.time, price: snapPrice(cur.time, cur.price) } });
        return;
      }
      const dt = cur.time - from.time;
      const exp = scaleModeRef.current === "exponential" && origA.price > 0 && origB.price > 0;
      updateArrow(id, {
        a: { time: origA.time + dt, price: shiftPrice(origA.price, from.price, cur.price, exp) },
        b: { time: origB.time + dt, price: shiftPrice(origB.price, from.price, cur.price, exp) },
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Helper — drag a rectangle by its body ("body") or resize it from a corner handle
  function startDragRectangle(e: React.MouseEvent, id: string, hit: RectangleHit) {
    const rect = rectanglesRef.current.find((r) => r.id === id);
    const start = pointerToTimePrice(e.clientX, e.clientY);
    if (!rect || !start) return;
    // Handled here — keep the chart from also starting a pan on this mousedown
    e.stopPropagation();
    e.preventDefault();

    const from: TrendPoint = start;
    const origA = rect.a;
    const origB = rect.b;
    const left = Math.min(origA.time, origB.time);
    const right = Math.max(origA.time, origB.time);
    const top = Math.max(origA.price, origB.price);
    const bottom = Math.min(origA.price, origB.price);
    // Resizing keeps the corner opposite the dragged one fixed
    const anchor: TrendPoint | null =
      hit === "body"
        ? null
        : {
            time: hit === "tl" || hit === "bl" ? right : left,
            price: hit === "tl" || hit === "tr" ? bottom : top,
          };

    function onMove(ev: MouseEvent) {
      const cur = pointerToTimePrice(ev.clientX, ev.clientY);
      if (!cur) return;
      if (anchor) {
        updateRectangle(id, {
          a: anchor,
          b: { time: cur.time, price: snapPrice(cur.time, cur.price) },
        });
        return;
      }
      const dt = cur.time - from.time;
      const exp = scaleModeRef.current === "exponential" && origA.price > 0 && origB.price > 0;
      updateRectangle(id, {
        a: { time: origA.time + dt, price: shiftPrice(origA.price, from.price, cur.price, exp) },
        b: { time: origB.time + dt, price: shiftPrice(origB.price, from.price, cur.price, exp) },
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Helper — drag a text annotation, shifting its anchor by the pointer delta
  // Works in pixels (anchor + pointer delta) and snaps to a real bar, so the text never lands
  // on a time without a candle (gaps, beyond the last bar) where it could not be drawn
  function startDragText(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    const t = textAnnotations.find((a) => a.id === id);
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!t || !chart || !series) return;
    const ax = chart.timeScale().timeToCoordinate(t.time as UTCTimestamp);
    const ay = series.priceToCoordinate(t.price);
    if (ax === null || ay === null) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    let lastTime = t.time;

    function onMove(ev: PointerEvent) {
      const x = ax! + (ev.clientX - startX);
      const y = ay! + (ev.clientY - startY);
      const time = chart!.timeScale().coordinateToTime(x);
      const price = series!.coordinateToPrice(y);
      if (time !== null) lastTime = Number(time);
      if (price === null || !isFinite(price)) return;
      updateTextAnnotation(id, { time: lastTime, price });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // Capture-phase mousedown on the chart: a selected rectangle's or arrow's body/handles take
  // the drag before the chart's own pan handling sees it.
  function handleChartMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || toolRef.current !== "cursor") return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    if (e.ctrlKey) {
      const trendHit = hitTestTrendLine(x, y);
      if (trendHit) {
        startDragTrendLine(e, trendHit, "move");
        return;
      }
    }
    if (selectedArrowId) {
      const hit = arrowPrimitivesRef.current.get(selectedArrowId)?.hitRegion(x, y);
      if (hit) startDragArrow(e, selectedArrowId, hit);
      return;
    }
    if (selectedRectangleId) {
      const hit = rectPrimitivesRef.current.get(selectedRectangleId)?.hitRegion(x, y);
      if (hit) startDragRectangle(e, selectedRectangleId, hit);
    }
  }

  // Helper — duplicate a trend line (same style, extend and times) shifted vertically by a few
  // pixels so the copy is visible and parallel to the original, then select it.
  function cloneTrendLine(id: string) {
    const container = containerRef.current;
    const series = candleSeriesRef.current;
    const line = trendLinesRef.current.find((t) => t.id === id);
    if (!container || !series || !line) return;

    const ya = series.priceToCoordinate(line.a.price);
    const yb = series.priceToCoordinate(line.b.price);
    if (ya === null || yb === null) return;
    // Shift down, unless that would push the copy toward the bottom edge of the chart
    const offset = Math.max(ya, yb) + CLONE_OFFSET_PX > container.clientHeight - 60 ? -CLONE_OFFSET_PX : CLONE_OFFSET_PX;
    const pa = series.coordinateToPrice(ya + offset);
    const pb = series.coordinateToPrice(yb + offset);
    if (pa === null || pb === null || !isFinite(pa) || !isFinite(pb)) return;

    const newId = addTrendLineRef.current(
      { time: line.a.time, price: pa },
      { time: line.b.time, price: pb },
      line.symbol,
      { color: line.color, extend: line.extend },
    );
    setSelectedTrendLineIdRef.current(newId);
  }

  // Helper — start dragging a trend line's endpoint ("a"/"b") or the whole line ("move")
  // Ctrl+drag on the line's body drags out a parallel copy instead, leaving the original in place
  function startDragTrendLine(e: React.MouseEvent, id: string, mode: "a" | "b" | "move") {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const line = trendLinesRef.current.find((t) => t.id === id);
    if (!container || !chart || !series || !line) return;

    function toTimePrice(clientX: number, clientY: number): TrendPoint | null {
      const rect = container!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const time = xToTime(x);
      const rawPrice = series!.coordinateToPrice(y);
      if (time === null || rawPrice === null || !isFinite(rawPrice)) return null;
      return { time, price: rawPrice };
    }

    const start = toTimePrice(e.clientX, e.clientY);
    if (!start) return;
    const origA = line.a;
    const origB = line.b;
    // The copy is only created once the pointer really moves, so a stray Ctrl+click
    // doesn't leave an invisible duplicate on top of the original
    let targetId: string | null = mode === "move" && e.ctrlKey ? null : id;
    const startX = e.clientX;
    const startY = e.clientY;

    function onMove(ev: MouseEvent) {
      if (targetId === null) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
        targetId = addTrendLineRef.current(line!.a, line!.b, line!.symbol, {
          color: line!.color,
          extend: line!.extend,
        });
        setSelectedTrendLineIdRef.current(targetId);
      }
      const cur = toTimePrice(ev.clientX, ev.clientY);
      if (!cur) return;
      if (mode === "move") {
        const dt = cur.time - start!.time;
        // Both endpoints must use the same mode or the line would rotate
        const exp =
          scaleModeRef.current === "exponential" && origA.price > 0 && origB.price > 0;
        updateTrendLine(targetId, {
          a: { time: origA.time + dt, price: shiftPrice(origA.price, start!.price, cur.price, exp) },
          b: { time: origB.time + dt, price: shiftPrice(origB.price, start!.price, cur.price, exp) },
        });
      } else {
        const price = snapPrice(cur.time, cur.price);
        updateTrendLine(targetId, mode === "a" ? { a: { time: cur.time, price } } : { b: { time: cur.time, price } });
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const palette = paletteRef.current;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: palette.border, separatorHoverColor: palette.border },
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: palette.textMuted, width: 1, style: 3, labelBackgroundColor: palette.panel },
        horzLine: { color: palette.textMuted, width: 1, style: 3, labelBackgroundColor: palette.panel },
      },
      rightPriceScale: {
        borderColor: palette.border,
        textColor: palette.textMuted,
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: palette.textMuted,
      priceLineStyle: 2,
    });

    // Preview of the rectangle being placed (data stays null until the first click)
    previewRectRef.current = new RectanglePrimitive(true);
    candleSeriesRef.current.attachPrimitive(previewRectRef.current);
    previewArrowRef.current = new ArrowPrimitive(true);
    candleSeriesRef.current.attachPrimitive(previewArrowRef.current);

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema150Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema150,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    smaRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.sma,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Pre-created once (not per-click), like the rectangle/arrow previews
    previewTrendRef.current = new TrendLinePrimitive((t) => timeToXRef.current(t), true);
    candleSeriesRef.current.attachPrimitive(previewTrendRef.current);

    chartRef.current = chart;

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (rawPrice === null || !isFinite(rawPrice)) return;
      const time = param.time ? Number(param.time) : null;
      const price = time !== null ? snapPrice(time, rawPrice) : rawPrice;

      if (toolRef.current === "cursor") {
        const arrowHit = hitTestArrowRef.current(param.point.x, param.point.y);
        if (arrowHit) {
          setSelectedArrowIdRef.current(arrowHit);
          return;
        }
        const trendHit = hitTestTrendLineRef.current(param.point.x, param.point.y);
        if (trendHit) {
          setSelectedTrendLineIdRef.current(trendHit);
          return;
        }
        const rectHit = hitTestRectangleRef.current(param.point.x, param.point.y);
        if (rectHit) {
          setSelectedRectangleIdRef.current(rectHit);
          return;
        }
        setSelectedTrendLineIdRef.current(null);
        setSelectedRectangleIdRef.current(null);
        setSelectedArrowIdRef.current(null);
        return;
      }

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "trendline") {
        // Points may land in the blank area past the last candle, like TradingView
        const t = time ?? xToTimeRef.current(param.point.x);
        if (t === null || (param.paneIndex ?? 0) !== 0) return;
        const current = trendDraftRef.current;
        if (current.phase === "idle") {
          setTrendDraft({ phase: "placing", a: { time: t, price }, b: { time: t, price } });
        } else if (current.a && t !== current.a.time) {
          addTrendLineRef.current(current.a, { time: t, price }, symbolRef.current);
          setTrendDraft(INITIAL_TREND_DRAFT);
        }
        return;
      }

      if (toolRef.current === "rect") {
        // Corners can't be resolved from clicks in the indicator panes (no candle price there)
        if (time === null || (param.paneIndex ?? 0) !== 0) return;
        const current = rectDraftRef.current;
        if (current.phase === "idle") {
          setRectDraft({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.a && (time !== current.a.time || price !== current.a.price)) {
          addRectangleRef.current(current.a, { time, price }, symbolRef.current);
          setRectDraft(INITIAL_TREND_DRAFT);
        }
        return;
      }

      if (toolRef.current === "arrow") {
        if (time === null || (param.paneIndex ?? 0) !== 0) return;
        const current = arrowDraftRef.current;
        if (current.phase === "idle") {
          setArrowDraft({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.a && (time !== current.a.time || price !== current.a.price)) {
          addArrowRef.current(current.a, { time, price }, symbolRef.current);
          setArrowDraft(INITIAL_TREND_DRAFT);
        }
        return;
      }

      if (toolRef.current === "measure") {
        if (time === null) return;
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
        return;
      }

      if (toolRef.current === "text") {
        if (time === null || textDraftRef.current) return;
        setTextDraft({ time, price, value: "" });
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "trendline" &&
        trendDraftRef.current.phase === "placing" &&
        param.point &&
        candleSeriesRef.current
      ) {
        const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        const time = param.time ? Number(param.time) : xToTimeRef.current(param.point.x);
        if (time !== null && rawPrice !== null && isFinite(rawPrice)) {
          const price = snapPrice(time, rawPrice);
          setTrendDraft((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (
        toolRef.current === "rect" &&
        rectDraftRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (rawPrice !== null && isFinite(rawPrice)) {
          const time = Number(param.time);
          const price = snapPrice(time, rawPrice);
          setRectDraft((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (
        toolRef.current === "arrow" &&
        arrowDraftRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (rawPrice !== null && isFinite(rawPrice)) {
          const time = Number(param.time);
          const price = snapPrice(time, rawPrice);
          setArrowDraft((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (rawPrice !== null && isFinite(rawPrice)) {
          const time = Number(param.time);
          const price = snapPrice(time, rawPrice);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      // Magnet attraction marker — shows where the point will snap to as the cursor
      // hovers a candle, even before the first click of a drawing tool.
      const isDrawingTool =
        toolRef.current === "hline" ||
        toolRef.current === "trendline" ||
        toolRef.current === "rect" ||
        toolRef.current === "arrow" ||
        toolRef.current === "measure" ||
        toolRef.current === "text";
      if (magnetRef.current && isDrawingTool && param.point && param.time && candleSeriesRef.current) {
        const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (rawPrice !== null && isFinite(rawPrice)) {
          const time = Number(param.time);
          setMagnetPoint({ time, price: snapPrice(time, rawPrice) });
        } else {
          setMagnetPoint(null);
        }
      } else {
        setMagnetPoint(null);
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesMapRef.current.clear();
      srPriceLinesRef.current = [];
      trendPrimitivesRef.current.clear();
      previewTrendRef.current = null;
      rectPrimitivesRef.current.clear();
      previewRectRef.current = null;
      arrowPrimitivesRef.current.clear();
      previewArrowRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema150Ref.current = null;
      ema200Ref.current = null;
      smaRef.current = null;
      rsiRef.current = null;
      rsiMaRef.current = null;
      rsiLevelsRef.current = [];
      rsiBandRef.current = null;
      macdHistRef.current = null;
      macdZeroLineRef.current = null;
    };
  }, []);

  // Re-theme the chart canvas (background/grid/borders/text) when the user toggles dark/light
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = TV_PALETTES[theme];
    chart.applyOptions({
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        panes: { separatorColor: palette.border, separatorHoverColor: palette.border },
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        vertLine: { color: palette.textMuted, labelBackgroundColor: palette.panel },
        horzLine: { color: palette.textMuted, labelBackgroundColor: palette.panel },
      },
      rightPriceScale: { borderColor: palette.border, textColor: palette.textMuted },
      timeScale: { borderColor: palette.border },
    });
    candleSeriesRef.current?.applyOptions({ priceLineColor: palette.textMuted });
    volumeSeriesRef.current?.applyOptions({ color: palette.textMuted });
    for (const line of rsiLevelsRef.current) line.applyOptions({ color: palette.textMuted });
    macdZeroLineRef.current?.applyOptions({ color: palette.textMuted });
    updateMACD();
  }, [theme]);

  // Price-axis mode for the main pane (linear vs exponential/log). Applied through the candle
  // series' own scale so the RSI/MACD panes keep their linear axes.
  useEffect(() => {
    candleSeriesRef.current?.priceScale().applyOptions({
      mode: scaleMode === "exponential" ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
    setRenderTick((t) => t + 1);
  }, [scaleMode]);

  // Alt+L toggles the log scale, like TradingView
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyL") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      setScaleMode(scaleModeRef.current === "exponential" ? "linear" : "exponential");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setScaleMode]);

  // Resolve the company/fund name for the ticker (stocks/ETFs only — crypto pairs have none)
  useEffect(() => {
    if (market !== "stock") {
      setCompanyName(null);
      return;
    }
    let cancelled = false;
    setCompanyName(null);
    fetchSymbolName(symbol).then((name) => {
      if (!cancelled) setCompanyName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, market]);

  // Latest news (lightning badges) — stocks & ETFs only, refreshed every few minutes
  useEffect(() => {
    if (market !== "stock") return;
    let cancelled = false;
    const load = () =>
      fetchStockNews(symbol)
        .then((items) => {
          if (!cancelled) setLoadedNews({ symbol, items });
        })
        .catch((e) => console.error("Failed to load stock news:", e));
    load();
    const id = setInterval(load, NEWS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, market]);

  // Corporate events (earnings / dividends / splits) — stocks & ETFs only
  useEffect(() => {
    if (market !== "stock") return;
    let cancelled = false;
    fetchStockEvents(symbol)
      .then((data) => {
        if (!cancelled) setLoadedEvents({ symbol, data });
      })
      .catch((e) => console.error("Failed to load stock events:", e));
    return () => {
      cancelled = true;
    };
  }, [symbol, market]);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: paletteRef.current.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = candlesRef.current.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      // TradingView look: purple RSI + yellow RSI-based MA, 70/50/30 guides over a shaded 30–70 band
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const ma = chartRef.current.addSeries(
        LineSeries,
        {
          color: RSI_MA_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      rsiLevelsRef.current = [
        { price: 70, lineStyle: 2 },
        { price: 50, lineStyle: 1 },
        { price: 30, lineStyle: 2 },
      ].map(({ price, lineStyle }) =>
        r.createPriceLine({
          price,
          color: paletteRef.current.textMuted,
          lineWidth: 1,
          lineStyle,
          axisLabelVisible: false,
          title: "",
        }),
      );
      const band = new BandPrimitive(30, 70, RSI_BAND_COLOR);
      r.attachPrimitive(band);
      if (macdHistRef.current && macdHistRef.current.getPane().paneIndex() === paneIndex) {
        macdHistRef.current.moveToPane(paneIndex + 1);
        chartRef.current.panes()[paneIndex + 1]?.setStretchFactor(1);
      }
      rsiRef.current = r;
      rsiMaRef.current = ma;
      rsiBandRef.current = band;
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsiMaRef.current) chartRef.current.removeSeries(rsiMaRef.current);
      rsiRef.current = null;
      rsiMaRef.current = null;
      rsiLevelsRef.current = [];
      rsiBandRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdHistRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      // Histogram only (no MACD/signal lines): the bars carry the whole reading
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdZeroLineRef.current = h.createPriceLine({
        price: 0,
        color: paletteRef.current.textMuted,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false,
        title: "",
      });
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdHistRef.current && chartRef.current) {
      chartRef.current.removeSeries(macdHistRef.current);
      macdHistRef.current = null;
      macdZeroLineRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema150Ref.current?.applyOptions({ visible: v("ema150") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    smaRef.current?.applyOptions({ visible: v("sma") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsiMaRef.current) rsiMaRef.current.applyOptions({ visible: v("rsi") });
    rsiBandRef.current?.setColor(v("rsi") ? RSI_BAND_COLOR : "transparent");
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
  }, [indicators, hidden]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema150, config.ema200]);

  useEffect(() => {
    updateSMA();
  }, [config.sma]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateSR();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.sr, hidden.sr, config.srLookback, config.srLevels, symbol]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Sync trend lines from the store to series primitives (one primitive per line)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = trendPrimitivesRef.current;
    const linesForThisSymbol = trendLines.filter((t) => t.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((t) => t.id));

    for (const [id, prim] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.detachPrimitive(prim);
        } catch {}
        map.delete(id);
      }
    }
    for (const tl of linesForThisSymbol) {
      let prim = map.get(tl.id);
      if (!prim) {
        prim = new TrendLinePrimitive((t) => timeToXRef.current(t));
        series.attachPrimitive(prim);
        map.set(tl.id, prim);
      }
      prim.setData({ a: tl.a, b: tl.b, color: tl.color, extend: tl.extend });
    }
  }, [trendLines, symbol]);

  // Sync the in-progress trend-line draft to the preview primitive (deferred a frame — updating
  // the chart synchronously inside the crosshair-move dispatch re-enters it)
  useEffect(() => {
    const prim = previewTrendRef.current;
    if (!prim) return;
    const raf = requestAnimationFrame(() => {
      prim.setData(
        trendDraft.phase === "placing" && trendDraft.a && trendDraft.b
          ? { a: trendDraft.a, b: trendDraft.b, color: TV_COLORS.blue, extend: DEFAULT_TRENDLINE_EXTEND }
          : null,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [trendDraft]);

  // Sync rectangles from the store to series primitives (one primitive per rectangle)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = rectPrimitivesRef.current;
    const forThisSymbol = rectangles.filter((r) => r.symbol === symbol);
    const activeIds = new Set(forThisSymbol.map((r) => r.id));

    for (const [id, prim] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.detachPrimitive(prim);
        } catch {}
        map.delete(id);
      }
    }
    for (const r of forThisSymbol) {
      let prim = map.get(r.id);
      if (!prim) {
        prim = new RectanglePrimitive();
        series.attachPrimitive(prim);
        map.set(r.id, prim);
      }
      prim.setData({ a: r.a, b: r.b, color: r.color, fillColor: r.fillColor });
      prim.setSelected(r.id === selectedRectangleId);
    }
  }, [rectangles, symbol, selectedRectangleId]);

  // Sync the in-progress rectangle draft to the preview primitive. Deferred a frame for the same
  // reason as the trend-line preview: it's driven by subscribeCrosshairMove.
  useEffect(() => {
    const prim = previewRectRef.current;
    if (!prim) return;
    const raf = requestAnimationFrame(() => {
      prim.setData(
        rectDraft.phase === "placing" && rectDraft.a && rectDraft.b
          ? {
              a: rectDraft.a,
              b: rectDraft.b,
              color: DEFAULT_TRENDLINE_COLOR,
              fillColor: DEFAULT_TRENDLINE_COLOR,
            }
          : null,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [rectDraft]);

  // Sync arrows from the store to series primitives (one primitive per arrow)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = arrowPrimitivesRef.current;
    const forThisSymbol = arrows.filter((ar) => ar.symbol === symbol);
    const activeIds = new Set(forThisSymbol.map((ar) => ar.id));

    for (const [id, prim] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.detachPrimitive(prim);
        } catch {}
        map.delete(id);
      }
    }
    for (const ar of forThisSymbol) {
      let prim = map.get(ar.id);
      if (!prim) {
        prim = new ArrowPrimitive();
        series.attachPrimitive(prim);
        map.set(ar.id, prim);
      }
      prim.setData({ a: ar.a, b: ar.b, color: ar.color });
      prim.setSelected(ar.id === selectedArrowId);
    }
  }, [arrows, symbol, selectedArrowId]);

  // Sync the in-progress arrow draft to the preview primitive (deferred a frame, like the rectangle)
  useEffect(() => {
    const prim = previewArrowRef.current;
    if (!prim) return;
    const raf = requestAnimationFrame(() => {
      prim.setData(
        arrowDraft.phase === "placing" && arrowDraft.a && arrowDraft.b
          ? { a: arrowDraft.a, b: arrowDraft.b, color: DEFAULT_TRENDLINE_COLOR }
          : null,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [arrowDraft]);

  // Cursor style when drawing tools are active + reset measure/trendline draft on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" || tool === "trendline" || tool === "rect" || tool === "arrow"
          ? "crosshair"
          : tool === "text"
            ? "text"
            : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    if (tool !== "trendline") setTrendDraft(INITIAL_TREND_DRAFT);
    if (tool !== "rect") setRectDraft(INITIAL_TREND_DRAFT);
    if (tool !== "arrow") setArrowDraft(INITIAL_TREND_DRAFT);
    if (tool !== "text") setTextDraft(null);
    if (tool !== "cursor") {
      setSelectedTrendLineId(null);
      setSelectedRectangleId(null);
      setSelectedArrowId(null);
    }
    setMagnetPoint(null);
  }, [tool]);

  // Escape while a drawing tool is active cancels the drawing in progress and goes back to the
  // cursor (switching tool resets every draft in the effect above), like TradingView
  useEffect(() => {
    if (tool === "cursor") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // The text tool's input handles its own Escape
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setTool("cursor");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, setTool]);

  // Delete/Backspace removes the selected drawing; Escape deselects it
  useEffect(() => {
    if (!selectedTrendLineId && !selectedRectangleId && !selectedArrowId) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedTrendLineId) removeTrendLine(selectedTrendLineId);
        if (selectedRectangleId) removeRectangle(selectedRectangleId);
        if (selectedArrowId) removeArrow(selectedArrowId);
        setSelectedTrendLineId(null);
        setSelectedRectangleId(null);
        setSelectedArrowId(null);
      } else if (e.key === "Escape") {
        setSelectedTrendLineId(null);
        setSelectedRectangleId(null);
        setSelectedArrowId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedTrendLineId,
    selectedRectangleId,
    selectedArrowId,
    removeTrendLine,
    removeRectangle,
    removeArrow,
    setSelectedTrendLineId,
    setSelectedRectangleId,
    setSelectedArrowId,
  ]);

  // Capture + download a PNG of the chart whenever a screenshot is requested
  useEffect(() => {
    if (screenshotRequestId === 0 || !chartRef.current) return;
    const canvas = chartRef.current.takeScreenshot();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `${symbolRef.current}-${stamp}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenshotRequestId]);

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last150: number | undefined;
    let last200: number | undefined;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema150Ref.current) {
      const data = ema(c, cfg.ema150);
      ema150Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last150 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema150: last150,
      ema200: last200,
      volume: lastVol,
    }));
  }

  function updateSMA() {
    const c = candlesRef.current;
    if (c.length === 0 || !smaRef.current) return;
    const cfg = configRef.current;
    const data = sma(c, cfg.sma);
    smaRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    setLastValues((prev) => ({ ...prev, sma: data.at(-1)?.value }));
  }

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const data = rsi(c, cfg.rsi).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);
    const maData = smaOfPoints(data, RSI_MA_PERIOD).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiMaRef.current?.setData(maData);
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value, rsiMa: maData.at(-1)?.value }));
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdHistRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    // Strong color while the bars grow away from zero, light while momentum fades
    const weak = paletteRef.current.histWeak;
    macdHistRef.current.setData(
      m.map((p, i) => {
        const prev = i > 0 ? m[i - 1].histogram : p.histogram;
        const growing = Math.abs(p.histogram) >= Math.abs(prev);
        return {
          time: p.time as UTCTimestamp,
          value: p.histogram,
          color:
            p.histogram >= 0
              ? growing ? MACD_HIST_COLORS.up : weak
              : growing ? MACD_HIST_COLORS.down : weak,
        };
      }),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }

  function updateSR() {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of srPriceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {}
    }
    srPriceLinesRef.current = [];
    if (!indicatorsRef.current.sr || hiddenRef.current.sr) return;
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    const levels = supportResistance(c, cfg.srLookback, cfg.srLevels);
    for (const lvl of levels) {
      const color = lvl.type === "support" ? TV_COLORS.green : TV_COLORS.red;
      const line = series.createPriceLine({
        price: lvl.price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: lvl.type === "support" ? "Soporte" : "Resistencia",
      });
      srPriceLinesRef.current.push(line);
    }
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function applyIncomingCandle(k: Candle) {
      if (!candleSeriesRef.current) return;
      const arr = candlesRef.current;
      const lastCandle = arr[arr.length - 1];
      if (lastCandle && lastCandle.time === k.time) {
        arr[arr.length - 1] = k;
      } else if (!lastCandle || k.time > lastCandle.time) {
        arr.push(k);
        if (arr.length > 2000) arr.shift();
      } else {
        return;
      }
      candleSeriesRef.current.update({
        time: k.time as UTCTimestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      });
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: k.time as UTCTimestamp,
          value: k.volume,
          color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
        });
      }
      updateEMAs();
      updateSMA();
      updateRSI();
      updateMACD();
      updateSR();
      const prev = arr[arr.length - 2] ?? lastCandle;
      setLastPrice({
        value: k.close,
        pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
      });
    }

    async function load() {
      try {
        const klines =
          market === "stock"
            ? await fetchStockKlines(symbol, timeframe)
            : await fetchKlines(symbol, timeframe, 1000);
        if (cancelled) return;
        candlesRef.current = klines;
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
            })),
          );
        }
        updateEMAs();
        updateSMA();
        updateRSI();
        updateMACD();
        updateSR();
        setCandlesVersion((v) => v + 1);
        chartRef.current?.timeScale().fitContent();
        requestAnimationFrame(() => recomputePaneOffsets());

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        if (market === "stock") {
          // No free real-time stream for stocks — poll the latest candle instead.
          pollTimer = setInterval(async () => {
            try {
              const fresh = await fetchStockKlines(symbol, timeframe);
              const last = fresh[fresh.length - 1];
              if (last) applyIncomingCandle(last);
            } catch (e) {
              console.error("Failed to poll stock candle:", e);
            }
          }, 15000);
        } else {
          const ws = getBinanceWS();
          unsub = ws.subscribeKline({
            symbol,
            interval: timeframe,
            onCandle: applyIncomingCandle,
          });
        }
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [symbol, timeframe]);

  function commitTextDraft() {
    const d = textDraftRef.current;
    // Cleared right away so the blur that follows Enter/Escape doesn't commit a second time
    textDraftRef.current = null;
    if (d) {
      const value = d.value.trim();
      if (d.id) {
        // Emptying an existing text deletes it
        if (value) updateTextAnnotation(d.id, { text: value });
        else removeTextAnnotation(d.id);
      } else if (value) {
        addTextAnnotationRef.current(d.time, d.price, value, symbolRef.current);
      }
    }
    setTextDraft(null);
  }

  function cancelTextDraft() {
    textDraftRef.current = null;
    setTextDraft(null);
  }

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }

  let trendLineHandlesRender: React.ReactNode = null;
  let trendLineToolbarRender: React.ReactNode = null;
  if (tool === "cursor" && selectedTrendLineId && chartRef.current && candleSeriesRef.current) {
    const selected = trendLines.find((t) => t.id === selectedTrendLineId && t.symbol === symbol);
    if (selected) {
      // From the store's points — the primitive's own data is only synced after this render
      const anchors = trendPrimitivesRef.current.get(selected.id)?.getAnchors(selected.a, selected.b);
      if (anchors) {
        const { ax, ay, bx, by } = anchors;
        // Toolbar over the on-screen part of the segment (an anchor may be far off-screen)
        const paneW = chartRef.current.timeScale().width();
        const visL = Math.max(0, Math.min(ax, bx));
        const visR = Math.min(paneW, Math.max(ax, bx));
        const midX = visL <= visR ? (visL + visR) / 2 : (ax + bx) / 2;
        const midY = bx === ax ? Math.min(ay, by) : ay + ((by - ay) * (midX - ax)) / (bx - ax);
        const color = selected.color;
        const extendLeft = selected.extend === "left" || selected.extend === "both";
        const extendRight = selected.extend === "right" || selected.extend === "both";

        trendLineHandlesRender = (
          <>
            <svg
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
              style={{ overflow: "visible" }}
            >
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: "stroke", cursor: "move" }}
                onMouseDown={(e) => startDragTrendLine(e, selected.id, "move")}
              />
            </svg>
            <div
              onMouseDown={(e) => startDragTrendLine(e, selected.id, "a")}
              style={{ left: ax, top: ay, borderColor: color }}
              className="absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 bg-tv-panel"
            />
            <div
              onMouseDown={(e) => startDragTrendLine(e, selected.id, "b")}
              style={{ left: bx, top: by, borderColor: color }}
              className="absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 bg-tv-panel"
            />
          </>
        );

        trendLineToolbarRender = (
          <TrendLineToolbar
            x={Math.max(100, Math.min(paneW - 100, midX))}
            y={Math.max(4, midY - 44)}
            color={color}
            extendLeft={extendLeft}
            extendRight={extendRight}
            onColorChange={(c) => updateTrendLine(selected.id, { color: c })}
            onToggleExtendLeft={() =>
              updateTrendLine(selected.id, { extend: toExtend(!extendLeft, extendRight) })
            }
            onToggleExtendRight={() =>
              updateTrendLine(selected.id, { extend: toExtend(extendLeft, !extendRight) })
            }
            onClone={() => cloneTrendLine(selected.id)}
            onDelete={() => {
              removeTrendLine(selected.id);
              setSelectedTrendLineId(null);
            }}
          />
        );
      }
    }
  }

  let rectangleToolbarRender: React.ReactNode = null;
  if (tool === "cursor" && selectedRectangleId) {
    const selected = rectangles.find((r) => r.id === selectedRectangleId && r.symbol === symbol);
    const box = rectPrimitivesRef.current.get(selectedRectangleId)?.getBox();
    if (selected && box) {
      rectangleToolbarRender = (
        <RectangleToolbar
          x={(box.left + box.right) / 2}
          y={Math.max(4, box.top - 72)}
          color={selected.color}
          fillColor={selected.fillColor}
          onColorChange={(c) => updateRectangle(selected.id, { color: c })}
          onFillColorChange={(c) => updateRectangle(selected.id, { fillColor: c })}
          onDelete={() => {
            removeRectangle(selected.id);
            setSelectedRectangleId(null);
          }}
        />
      );
    }
  }

  let arrowToolbarRender: React.ReactNode = null;
  if (tool === "cursor" && selectedArrowId) {
    const selected = arrows.find((ar) => ar.id === selectedArrowId && ar.symbol === symbol);
    const seg = arrowPrimitivesRef.current.get(selectedArrowId)?.getSegment();
    if (selected && seg) {
      arrowToolbarRender = (
        <ArrowToolbar
          x={(seg.ax + seg.bx) / 2}
          y={Math.max(4, Math.min(seg.ay, seg.by) - 44)}
          color={selected.color}
          onColorChange={(c) => updateArrow(selected.id, { color: c })}
          onDelete={() => {
            removeArrow(selected.id);
            setSelectedArrowId(null);
          }}
        />
      );
    }
  }

  const textAnnotationRenders: React.ReactNode[] = [];
  if (chartRef.current && candleSeriesRef.current) {
    const ts = chartRef.current.timeScale();
    for (const t of textAnnotations.filter((a) => a.symbol === symbol)) {
      if (textDraft?.id === t.id) continue; // the edit input is drawn in its place
      const x = ts.timeToCoordinate(t.time as UTCTimestamp);
      const y = candleSeriesRef.current.priceToCoordinate(t.price);
      if (x === null || y === null) continue;
      textAnnotationRenders.push(
        <div
          key={t.id}
          style={{ left: x, top: y }}
          onPointerDown={(e) => startDragText(e, t.id)}
          onDoubleClick={() => setTextDraft({ id: t.id, time: t.time, price: t.price, value: t.text })}
          title="Arrastrar para mover · doble clic para editar"
          className="absolute z-10 cursor-move touch-none select-none -translate-y-1/2 translate-x-1 whitespace-nowrap rounded border border-tv-border bg-tv-panel/90 px-1.5 py-0.5 text-xs text-tv-text"
        >
          {t.text}
        </div>,
      );
    }
  }

  let textDraftRender: React.ReactNode = null;
  if (textDraft && chartRef.current && candleSeriesRef.current) {
    const ts = chartRef.current.timeScale();
    const x = ts.timeToCoordinate(textDraft.time as UTCTimestamp);
    const y = candleSeriesRef.current.priceToCoordinate(textDraft.price);
    if (x !== null && y !== null) {
      textDraftRender = (
        <input
          autoFocus
          value={textDraft.value}
          onChange={(e) => setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTextDraft();
            if (e.key === "Escape") cancelTextDraft();
          }}
          onBlur={commitTextDraft}
          placeholder="Texto…"
          style={{ left: x, top: y }}
          className="absolute z-20 -translate-y-1/2 translate-x-1 rounded border border-tv-blue bg-tv-panel px-1.5 py-0.5 text-xs text-tv-text outline-none"
        />
      );
    }
  }

  let magnetMarkerRender: React.ReactNode = null;
  if (magnetMode && magnetPoint && chartRef.current && candleSeriesRef.current) {
    const ts = chartRef.current.timeScale();
    const x = ts.timeToCoordinate(magnetPoint.time as UTCTimestamp);
    const y = candleSeriesRef.current.priceToCoordinate(magnetPoint.price);
    if (x !== null && y !== null) {
      magnetMarkerRender = (
        <div
          style={{ left: x, top: y }}
          className="pointer-events-none absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-tv-blue bg-tv-blue/30"
        />
      );
    }
  }

  // Events are drawn as HTML badges in a strip at the bottom of the main pane (like
  // TradingView), not as series markers on the candles. candlesVersion keeps it in sync.
  void candlesVersion;
  eventsByCandleRef.current = bucketEventsByCandle(
    (stockEvents?.events ?? []).filter((e) => eventToggles[e.type]),
    candlesRef.current.map((c) => c.time),
  );
  // Bottom strip of the main pane holding the event badges
  const mainPane = paneOffsets[0];
  const eventStripY = mainPane ? mainPane.top + mainPane.height - EVENT_STRIP_OFFSET : null;
  const eventBadgeRenders: React.ReactNode[] = [];
  if (chartRef.current && eventStripY !== null && eventsByCandleRef.current.size > 0) {
    const ts = chartRef.current.timeScale();
    const width = ts.width();
    for (const [time, list] of eventsByCandleRef.current) {
      const x = ts.timeToCoordinate(time as UTCTimestamp);
      if (x === null || x < 0 || x > width) continue;
      // One badge per event type per candle (weekly/monthly candles can hold several dividends)
      const types = [...new Set(list.map((e) => e.type))];
      types.forEach((type, i) => {
        eventBadgeRenders.push(
          <div
            key={`${time}-${type}`}
            style={{
              left: x,
              top: eventStripY - i * (EVENT_BADGE_SIZE + 2),
              width: EVENT_BADGE_SIZE,
              height: EVENT_BADGE_SIZE,
              backgroundColor: EVENT_STYLE[type].color,
            }}
            className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white opacity-90"
          >
            {EVENT_STYLE[type].letter}
          </div>,
        );
      });
    }
  }

  // News: one lightning badge per candle, stacked above that candle's event badges. Stories newer
  // than the last candle (e.g. weekend news on a daily chart) go on the last candle.
  const newsBadgeRenders: React.ReactNode[] = [];
  const candleTimes = candlesRef.current.map((c) => c.time);
  if (
    chartRef.current &&
    eventStripY !== null &&
    eventToggles.news &&
    stockNews &&
    stockNews.length > 0 &&
    candleTimes.length > 0
  ) {
    const lastTime = candleTimes[candleTimes.length - 1];
    const newsByCandle = bucketEventsByCandle(
      stockNews.map((item) => ({ time: Math.min(item.time, lastTime), item })),
      candleTimes,
    );
    const ts = chartRef.current.timeScale();
    const width = ts.width();
    // Candles closer than a badge width (intraday, zoomed out) share one badge, placed on the
    // most recent of them, so the icons never pile on top of each other
    const groups: { time: number; x: number; items: NewsItem[] }[] = [];
    for (const [time, list] of [...newsByCandle.entries()].sort((a, b) => a[0] - b[0])) {
      const x = ts.timeToCoordinate(time as UTCTimestamp);
      if (x === null || x < 0 || x > width) continue;
      const prev = groups[groups.length - 1];
      if (prev && x - prev.x < EVENT_BADGE_SIZE + 2) {
        prev.time = time;
        prev.x = x;
        prev.items.push(...list.map((n) => n.item));
      } else {
        groups.push({ time, x, items: list.map((n) => n.item) });
      }
    }
    for (const { time, x, items: groupItems } of groups) {
      const items = groupItems.sort((a, b) => b.time - a.time);
      const stack = new Set(eventsByCandleRef.current.get(time)?.map((e) => e.type)).size;
      const isOpen = openNews?.time === time;
      const expanded = isOpen && openNews.expanded;
      const shown = expanded ? items : items.slice(0, 1);
      // Open toward whichever side has room, like the event tooltip
      const cardSide = x > width / 2 ? { right: -EVENT_BADGE_SIZE / 2 } : { left: -EVENT_BADGE_SIZE / 2 };
      newsBadgeRenders.push(
        <div
          key={`news-${time}`}
          style={{
            left: x,
            top: eventStripY - stack * (EVENT_BADGE_SIZE + 2),
            width: EVENT_BADGE_SIZE,
            height: EVENT_BADGE_SIZE,
          }}
          onMouseEnter={() => setOpenNews((cur) => (cur?.time === time ? cur : { time, expanded: false }))}
          onMouseLeave={() => setOpenNews((cur) => (cur?.time === time ? null : cur))}
          className={cn("absolute -translate-x-1/2 -translate-y-1/2", isOpen ? "z-40" : "z-10")}
        >
          <div
            style={{ backgroundColor: NEWS_COLOR }}
            className="flex h-full w-full cursor-pointer items-center justify-center rounded-full text-white opacity-90"
          >
            <Zap className="h-2.5 w-2.5" fill="currentColor" />
          </div>
          {isOpen && (
            // Bottom padding bridges the gap to the badge so the pointer can move onto the card
            <div style={{ ...cardSide, bottom: EVENT_BADGE_SIZE / 2 }} className="absolute w-80 pb-3">
              <div
                style={{ borderLeftColor: NEWS_COLOR }}
                className="rounded-md border border-l-4 border-tv-border bg-tv-panel p-3 shadow-xl"
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-tv-text">
                  <span
                    style={{ color: NEWS_COLOR, borderColor: NEWS_COLOR }}
                    className="flex h-5 w-5 items-center justify-center rounded-full border-2"
                  >
                    <Zap className="h-3 w-3" fill="currentColor" />
                  </span>
                  Últimas actualizaciones
                </div>
                <div className={cn("flex flex-col gap-2.5", expanded && "max-h-72 overflow-y-auto pr-1")}>
                  {shown.map((n) => (
                    <a
                      key={n.id}
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={n.originalTitle}
                      className="group block"
                    >
                      <div className="text-[11px] text-tv-text-muted">
                        {timeAgo(n.time)} · {n.publisher}
                      </div>
                      <div className="text-xs leading-snug text-tv-text group-hover:text-tv-blue">
                        {n.title}
                      </div>
                    </a>
                  ))}
                </div>
                {items.length > 1 && (
                  <button
                    onClick={() => setOpenNews({ time, expanded: !expanded })}
                    className="mt-2 flex items-center gap-0.5 text-[11px] text-tv-text-muted hover:text-tv-text"
                  >
                    {expanded ? "Ver menos" : `Ver todos (${items.length})`}
                    {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>,
      );
    }
  }

  let eventTooltipRender: React.ReactNode = null;
  const hoveredEvents = hover ? eventsByCandleRef.current.get(hover.time) : undefined;
  if (hover && hoveredEvents && chartRef.current && eventStripY !== null) {
    const x = chartRef.current.timeScale().timeToCoordinate(hover.time as UTCTimestamp);
    if (x !== null) {
      // Open toward whichever side has room so it never slides under the price scale / sidebar
      const width = containerRef.current?.clientWidth ?? 0;
      const side = x > width / 2 ? { right: width - x + 10 } : { left: x + 10 };
      eventTooltipRender = (
        <div
          style={{ ...side, bottom: (containerRef.current?.clientHeight ?? 0) - eventStripY + EVENT_BADGE_SIZE }}
          className="pointer-events-none absolute z-20 rounded border border-tv-border bg-tv-panel px-2 py-1.5 text-[11px] shadow-lg"
        >
          {hoveredEvents.map((e, i) => (
            <div key={i} className="flex items-center gap-2 whitespace-nowrap">
              <span
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ backgroundColor: EVENT_STYLE[e.type].color }}
              >
                {EVENT_STYLE[e.type].letter}
              </span>
              <span className="text-tv-text">{describeEvent(e)}</span>
              <span className="text-tv-text-muted">
                {new Date(e.time * 1000).toLocaleDateString("es-AR")}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }

  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        onMouseDownCapture={handleChartMouseDown}
        className="h-full w-full"
      />
      {measureRender}
      {trendLineHandlesRender}
      {trendLineToolbarRender}
      {rectangleToolbarRender}
      {arrowToolbarRender}
      {textAnnotationRenders}
      {textDraftRender}
      {magnetMarkerRender}
      {eventBadgeRenders}
      {newsBadgeRenders}

      {/* Log-scale toggle at the bottom of the main pane's price axis, like TradingView */}
      {mainPane && chartRef.current && (
        <button
          onClick={() => setScaleMode(scaleMode === "exponential" ? "linear" : "exponential")}
          style={{
            top: mainPane.top + mainPane.height - 22,
            right: 0,
            width: chartRef.current.priceScale("right").width(),
          }}
          title="Escala logarítmica (Alt+L)"
          aria-pressed={scaleMode === "exponential"}
          className="absolute z-10 flex h-5 items-center justify-center"
        >
          <span
            className={cn(
              "rounded px-1.5 text-[10px] font-semibold leading-4",
              scaleMode === "exponential"
                ? "bg-tv-blue text-white"
                : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            LOG
          </span>
        </button>
      )}
      {eventTooltipRender}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{symbol}</span>
            {companyName && (
              <span
                className="max-w-[180px] truncate font-normal text-tv-text-muted"
                title={companyName}
              >
                {companyName}
              </span>
            )}
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">
              {market === "stock" ? "Yahoo Finance" : "Binance"}
            </span>
            {market === "stock" && eventToggles.earnings && stockEvents?.nextEarnings && (
              <>
                <span className="text-tv-text-muted">·</span>
                <span className="font-normal" style={{ color: EVENT_STYLE.earnings.color }}>
                  Próx. resultados{" "}
                  {new Date(stockEvents.nextEarnings.time * 1000).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </>
            )}
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-7 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div className="mt-1 flex flex-col items-start gap-1">
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema150 && (
            <IndicatorPill
              name={`EMA ${config.ema150}`}
              value={lastValues.ema150 !== undefined ? formatPrice(lastValues.ema150) : undefined}
              color={INDICATOR_COLORS.ema150}
              hidden={hidden.ema150}
              onToggleHide={() => toggleHidden("ema150")}
              onSettings={() => setSettingsTarget("ema150")}
              onRemove={() => removeIndicator("ema150")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
          {indicators.sma && (
            <IndicatorPill
              name={`SMA ${config.sma}`}
              value={lastValues.sma !== undefined ? formatPrice(lastValues.sma) : undefined}
              color={INDICATOR_COLORS.sma}
              hidden={hidden.sma}
              onToggleHide={() => toggleHidden("sma")}
              onSettings={() => setSettingsTarget("sma")}
              onRemove={() => removeIndicator("sma")}
            />
          )}
          {indicators.volume && (
            <IndicatorPill
              name="Vol"
              value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
              color={INDICATOR_COLORS.volume}
              hidden={hidden.volume}
              onToggleHide={() => toggleHidden("volume")}
              onSettings={() => setSettingsTarget("volume")}
              onRemove={() => removeIndicator("volume")}
            />
          )}
        </div>
      </div>

      {/* RSI pane label */}
      {indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi} close`}
            value={
              lastValues.rsi !== undefined ? (
                <>
                  <span style={{ color: INDICATOR_COLORS.rsi }}>{lastValues.rsi.toFixed(2)}</span>{" "}
                  {lastValues.rsiMa !== undefined && (
                    <span style={{ color: RSI_MA_COLOR }}>{lastValues.rsiMa.toFixed(2)}</span>
                  )}
                </>
              ) : undefined
            }
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {indicators.macd && paneOffsets[macdPaneIdx] && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macdHist !== undefined ? (
                <span
                  style={{
                    color: lastValues.macdHist >= 0 ? MACD_HIST_COLORS.up : MACD_HIST_COLORS.down,
                  }}
                >
                  {lastValues.macdHist.toFixed(2)}
                </span>
              ) : undefined
            }
            color={MACD_HIST_COLORS.up}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}
    </div>
  );
}
