import type { Candle } from "@/lib/binance/types";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: number;
}

/**
 * Support/Resistance — fractal pivot highs/lows (swing points within `lookback`
 * candles on each side) clustered by proximity, ranked by touch count.
 */
export function supportResistance(
  candles: Candle[],
  lookback = 5,
  maxLevels = 4,
): SRLevel[] {
  if (candles.length < lookback * 2 + 1) return [];

  type Pivot = { price: number; type: "support" | "resistance" };
  const pivots: Pivot[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high > h) isHigh = false;
      if (candles[j].low < l) isLow = false;
    }
    if (isHigh) pivots.push({ price: h, type: "resistance" });
    if (isLow) pivots.push({ price: l, type: "support" });
  }
  if (pivots.length === 0) return [];

  const avgPrice = candles.reduce((s, c) => s + c.close, 0) / candles.length;
  const tolerance = avgPrice * 0.005;

  function cluster(items: Pivot[]): SRLevel[] {
    const sorted = [...items].sort((a, b) => a.price - b.price);
    const groups: { prices: number[]; type: "support" | "resistance" }[] = [];
    for (const p of sorted) {
      const last = groups[groups.length - 1];
      if (last && p.price - last.prices[last.prices.length - 1] <= tolerance) {
        last.prices.push(p.price);
      } else {
        groups.push({ prices: [p.price], type: p.type });
      }
    }
    return groups.map((g) => ({
      price: g.prices.reduce((s, v) => s + v, 0) / g.prices.length,
      type: g.type,
      strength: g.prices.length,
    }));
  }

  const resistances = cluster(pivots.filter((p) => p.type === "resistance"))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxLevels);
  const supports = cluster(pivots.filter((p) => p.type === "support"))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxLevels);

  return [...supports, ...resistances].sort((a, b) => b.price - a.price);
}

/**
 * Simple Moving Average
 */
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

/**
 * Exponential Moving Average — seeded with SMA of first `period` candles.
 */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/**
 * RSI (SMA-smoothed) — average gain/loss is a simple moving average over
 * `period` (rolling window), not Wilder's RMA. Period typically 14.
 */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gainSum += g;
    lossSum += l;
    const j = i - period;
    if (j >= 1) {
      const oldDiff = candles[j].close - candles[j - 1].close;
      gainSum -= oldDiff > 0 ? oldDiff : 0;
      lossSum -= oldDiff < 0 ? -oldDiff : 0;
    }
    if (i >= period) {
      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
    }
  }
  return out;
}

/**
 * MACD — fast EMA, slow EMA, signal EMA of the MACD line.
 * Defaults: 12 / 26 / 9.
 */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  if (candles.length < slow + signal) return [];
  const emaFast = ema(candles, fast);
  const emaSlow = ema(candles, slow);
  // align: emaSlow starts later
  const slowStartTime = emaSlow[0].time;
  const fastByTime = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of emaSlow) {
    const f = fastByTime.get(p.time);
    if (f !== undefined) macdLine.push({ time: p.time, value: f - p.value });
  }
  // signal = EMA of MACD line. Build synthetic candles for ema()
  const synth: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const sig = ema(synth, signal);
  const sigByTime = new Map(sig.map((p) => [p.time, p.value]));
  const out: MACDPoint[] = [];
  for (const p of macdLine) {
    const s = sigByTime.get(p.time);
    if (s === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: s, histogram: p.value - s });
  }
  void slowStartTime;
  return out;
}
