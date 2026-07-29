"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { fetchStockKlines, fetchSymbolName } from "@/lib/stocks/rest";
import { getMarketType } from "@/lib/market";
import { ema, sma, rsi, macd, supportResistance } from "@/lib/indicators";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
  type TrendPoint,
  type TrendLine,
  type TrendLineExtend,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { TrendLineToolbar } from "./TrendLineToolbar";

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

function toExtend(left: boolean, right: boolean): TrendLineExtend {
  if (left && right) return "both";
  if (left) return "left";
  if (right) return "right";
  return "none";
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
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
}

const TV_PALETTES: Record<"dark" | "light", ThemePalette> = {
  dark: {
    bg: "#131722",
    panel: "#1e222d",
    border: "#2a2e39",
    text: "#d1d4dc",
    textMuted: "#787b86",
    grid: "#1e222d",
  },
  light: {
    bg: "#ffffff",
    panel: "#f5f6fa",
    border: "#e0e3eb",
    text: "#131722",
    textMuted: "#5d606b",
    grid: "#f5f6fa",
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
  ema200?: number;
  sma?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
}

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
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const smaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const srPriceLinesRef = useRef<IPriceLine[]>([]);
  const trendSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const previewTrendSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const magnetMode = useChartStore((s) => s.magnetMode);
  const priceLines = useChartStore((s) => s.priceLines);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const trendLines = useChartStore((s) => s.trendLines);
  const addTrendLine = useChartStore((s) => s.addTrendLine);
  const updateTrendLine = useChartStore((s) => s.updateTrendLine);
  const removeTrendLine = useChartStore((s) => s.removeTrendLine);
  const selectedTrendLineId = useChartStore((s) => s.selectedTrendLineId);
  const setSelectedTrendLineId = useChartStore((s) => s.setSelectedTrendLineId);
  const textAnnotations = useChartStore((s) => s.textAnnotations);
  const addTextAnnotation = useChartStore((s) => s.addTextAnnotation);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const screenshotRequestId = useChartStore((s) => s.screenshotRequestId);
  const theme = useChartStore((s) => s.theme);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const magnetRef = useRef(magnetMode);
  magnetRef.current = magnetMode;
  const paletteRef = useRef<ThemePalette>(TV_PALETTES[theme]);
  paletteRef.current = TV_PALETTES[theme];
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const addTrendLineRef = useRef(addTrendLine);
  addTrendLineRef.current = addTrendLine;
  const trendLinesRef = useRef(trendLines);
  trendLinesRef.current = trendLines;
  const setSelectedTrendLineIdRef = useRef(setSelectedTrendLineId);
  setSelectedTrendLineIdRef.current = setSelectedTrendLineId;
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
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [trendDraft, setTrendDraft] = useState<TrendDraftState>(INITIAL_TREND_DRAFT);
  const [textDraft, setTextDraft] = useState<TextDraftState | null>(null);
  const [magnetPoint, setMagnetPoint] = useState<TrendPoint | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const trendDraftRef = useRef(trendDraft);
  trendDraftRef.current = trendDraft;
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

  // Helper — resolve the two points a trend line should actually be drawn between,
  // extrapolating past a/b toward the visible edges when "extend" (ray) is set.
  function computeExtendedPoints(tl: TrendLine): TrendPoint[] {
    const [p1, p2] = [tl.a, tl.b].sort((x, y) => x.time - y.time);
    if (tl.extend === "none" || !chartRef.current) return [p1, p2];
    const dt = p2.time - p1.time;
    if (dt === 0) return [p1, p2];
    const slope = (p2.price - p1.price) / dt;
    const range = chartRef.current.timeScale().getVisibleRange();
    let leftTime = p1.time;
    let rightTime = p2.time;
    if (range) {
      const from = Number(range.from);
      const to = Number(range.to);
      const margin = Math.max(1, to - from);
      if (tl.extend === "left" || tl.extend === "both") leftTime = Math.min(p1.time, from - margin);
      if (tl.extend === "right" || tl.extend === "both") rightTime = Math.max(p2.time, to + margin);
    }
    const leftPrice = p1.price + slope * (leftTime - p1.time);
    const rightPrice = p1.price + slope * (rightTime - p1.time);
    return [
      { time: leftTime, price: leftPrice },
      { time: rightTime, price: rightPrice },
    ];
  }

  // Helper — find the nearest trend line (for this symbol) to a click point, within a pixel threshold
  function hitTestTrendLine(px: number, py: number): string | null {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const ts = chart.timeScale();
    const lines = trendLinesRef.current.filter((t) => t.symbol === symbolRef.current);
    let bestId: string | null = null;
    let bestDist = 8;
    for (const tl of lines) {
      const [p1, p2] = computeExtendedPoints(tl);
      const ax = ts.timeToCoordinate(p1.time as UTCTimestamp);
      const ay = series.priceToCoordinate(p1.price);
      const bx = ts.timeToCoordinate(p2.time as UTCTimestamp);
      const by = series.priceToCoordinate(p2.price);
      if (ax === null || ay === null || bx === null || by === null) continue;
      const d = distanceToSegment(px, py, ax, ay, bx, by);
      if (d < bestDist) {
        bestDist = d;
        bestId = tl.id;
      }
    }
    return bestId;
  }
  const hitTestTrendLineRef = useRef(hitTestTrendLine);
  hitTestTrendLineRef.current = hitTestTrendLine;

  // Helper — start dragging a trend line's endpoint ("a"/"b") or the whole line ("move")
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
      const time = chart!.timeScale().coordinateToTime(x);
      const rawPrice = series!.coordinateToPrice(y);
      if (time === null || rawPrice === null || !isFinite(rawPrice)) return null;
      return { time: Number(time), price: rawPrice };
    }

    const start = toTimePrice(e.clientX, e.clientY);
    if (!start) return;
    const origA = line.a;
    const origB = line.b;

    function onMove(ev: MouseEvent) {
      const cur = toTimePrice(ev.clientX, ev.clientY);
      if (!cur) return;
      if (mode === "move") {
        const dt = cur.time - start!.time;
        const dp = cur.price - start!.price;
        updateTrendLine(id, {
          a: { time: origA.time + dt, price: origA.price + dp },
          b: { time: origB.time + dt, price: origB.price + dp },
        });
      } else {
        const price = snapPrice(cur.time, cur.price);
        updateTrendLine(id, mode === "a" ? { a: { time: cur.time, price } } : { b: { time: cur.time, price } });
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

    // Pre-created once (not per-click) — calling addSeries() inside the click
    // handler was breaking the browser's next click on the chart's canvas.
    previewTrendSeriesRef.current = chart.addSeries(LineSeries, {
      color: TV_COLORS.blue,
      lineWidth: 2,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });

    chartRef.current = chart;

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (rawPrice === null || !isFinite(rawPrice)) return;
      const time = param.time ? Number(param.time) : null;
      const price = time !== null ? snapPrice(time, rawPrice) : rawPrice;

      if (toolRef.current === "cursor") {
        const hitId = hitTestTrendLineRef.current(param.point.x, param.point.y);
        setSelectedTrendLineIdRef.current(hitId);
        return;
      }

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "trendline") {
        if (time === null) return;
        const current = trendDraftRef.current;
        if (current.phase === "idle") {
          setTrendDraft({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.a && time !== current.a.time) {
          addTrendLineRef.current(current.a, { time, price }, symbolRef.current);
          setTrendDraft(INITIAL_TREND_DRAFT);
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
        param.time &&
        candleSeriesRef.current
      ) {
        const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (rawPrice !== null && isFinite(rawPrice)) {
          const time = Number(param.time);
          const price = snapPrice(time, rawPrice);
          setTrendDraft((prev) =>
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
      trendSeriesMapRef.current.clear();
      previewTrendSeriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      smaRef.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
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
    rsi30Ref.current?.applyOptions({ color: palette.textMuted });
    rsi70Ref.current?.applyOptions({ color: palette.textMuted });
  }, [theme]);

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
      const r30 = chartRef.current.addSeries(
        LineSeries,
        {
          color: paletteRef.current.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r70 = chartRef.current.addSeries(
        LineSeries,
        {
          color: paletteRef.current.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsi30Ref.current) chartRef.current.removeSeries(rsi30Ref.current);
      if (rsi70Ref.current) chartRef.current.removeSeries(rsi70Ref.current);
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    smaRef.current?.applyOptions({ visible: v("sma") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
  }, [indicators, hidden]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

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

  // Sync trend lines from store to the chart
  useEffect(() => {
    if (!chartRef.current) return;
    const map = trendSeriesMapRef.current;
    const linesForThisSymbol = trendLines.filter((t) => t.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((t) => t.id));

    for (const [id, series] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          chartRef.current.removeSeries(series);
        } catch {}
        map.delete(id);
      }
    }
    for (const tl of linesForThisSymbol) {
      let series = map.get(tl.id);
      if (!series) {
        series = chartRef.current.addSeries(LineSeries, {
          color: tl.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        map.set(tl.id, series);
      } else {
        series.applyOptions({ color: tl.color });
      }
      const points = computeExtendedPoints(tl);
      series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
    }
    // renderTick — extended (ray) lines need their endpoints recomputed as the visible range pans/zooms
  }, [trendLines, symbol, renderTick]);

  // Sync the in-progress trend-line draft to the (pre-created, always-mounted) preview series.
  // Chart/series mutations must stay out of subscribeClick/subscribeCrosshairMove — doing them
  // there was silently breaking the chart's own next click.
  useEffect(() => {
    const series = previewTrendSeriesRef.current;
    if (!series) return;
    // Deferred to the next frame — calling setData synchronously here (inside the
    // effect triggered by subscribeCrosshairMove's setTrendDraft) re-enters the
    // chart's crosshair-move dispatch and causes an infinite update loop.
    const raf = requestAnimationFrame(() => {
      if (trendDraft.phase === "placing" && trendDraft.a && trendDraft.b) {
        if (trendDraft.a.time === trendDraft.b.time) {
          series.setData([{ time: trendDraft.a.time as UTCTimestamp, value: trendDraft.a.price }]);
        } else {
          const points = [trendDraft.a, trendDraft.b].sort((x, y) => x.time - y.time);
          series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
        }
        series.applyOptions({ visible: true });
      } else {
        series.setData([]);
        series.applyOptions({ visible: false });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [trendDraft]);

  // Cursor style when drawing tools are active + reset measure/trendline draft on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" || tool === "trendline"
          ? "crosshair"
          : tool === "text"
            ? "text"
            : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    if (tool !== "trendline") setTrendDraft(INITIAL_TREND_DRAFT);
    if (tool !== "text") setTextDraft(null);
    if (tool !== "cursor") setSelectedTrendLineId(null);
    setMagnetPoint(null);
  }, [tool]);

  // Delete/Backspace removes the selected trend line; Escape deselects it
  useEffect(() => {
    if (!selectedTrendLineId) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedTrendLineId) removeTrendLine(selectedTrendLineId);
        setSelectedTrendLineId(null);
      } else if (e.key === "Escape") {
        setSelectedTrendLineId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTrendLineId, removeTrendLine, setSelectedTrendLineId]);

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
    if (rsi30Ref.current && data.length > 0)
      rsi30Ref.current.setData([
        { time: data[0].time, value: 30 },
        { time: data[data.length - 1].time, value: 30 },
      ]);
    if (rsi70Ref.current && data.length > 0)
      rsi70Ref.current.setData([
        { time: data[0].time, value: 70 },
        { time: data[data.length - 1].time, value: 70 },
      ]);
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
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
    if (d && d.value.trim()) {
      addTextAnnotationRef.current(d.time, d.price, d.value.trim(), symbolRef.current);
    }
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
      const ts = chartRef.current.timeScale();
      const ax = ts.timeToCoordinate(selected.a.time as UTCTimestamp);
      const ay = candleSeriesRef.current.priceToCoordinate(selected.a.price);
      const bx = ts.timeToCoordinate(selected.b.time as UTCTimestamp);
      const by = candleSeriesRef.current.priceToCoordinate(selected.b.price);
      if (ax !== null && ay !== null && bx !== null && by !== null) {
        const midX = (ax + bx) / 2;
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
            x={midX}
            y={Math.min(ay, by) - 44}
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
            onDelete={() => {
              removeTrendLine(selected.id);
              setSelectedTrendLineId(null);
            }}
          />
        );
      }
    }
  }

  const textAnnotationRenders: React.ReactNode[] = [];
  if (chartRef.current && candleSeriesRef.current) {
    const ts = chartRef.current.timeScale();
    for (const t of textAnnotations.filter((a) => a.symbol === symbol)) {
      const x = ts.timeToCoordinate(t.time as UTCTimestamp);
      const y = candleSeriesRef.current.priceToCoordinate(t.price);
      if (x === null || y === null) continue;
      textAnnotationRenders.push(
        <div
          key={t.id}
          style={{ left: x, top: y }}
          className="pointer-events-none absolute z-10 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded border border-tv-border bg-tv-panel/90 px-1.5 py-0.5 text-xs text-tv-text"
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
            if (e.key === "Escape") setTextDraft(null);
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

  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}
      {trendLineHandlesRender}
      {trendLineToolbarRender}
      {textAnnotationRenders}
      {textDraftRender}
      {magnetMarkerRender}

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
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
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
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
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
