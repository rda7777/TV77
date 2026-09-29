import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export interface ArrowData {
  /** Tail */
  a: { time: number; price: number };
  /** Head */
  b: { time: number; price: number };
  /** Line + head color (#rrggbb) */
  color: string;
}

/** Pane-relative CSS-pixel endpoints of an arrow */
export interface ArrowSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export type ArrowHit = "body" | "a" | "b";

const LINE_WIDTH = 2;
const HEAD_LENGTH = 12;
const HEAD_HALF_WIDTH = 6;
const HANDLE_RADIUS = 4;
const HANDLE_HIT_RADIUS = 8;
const BODY_HIT_DISTANCE = 6;

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

function distanceToSegment(px: number, py: number, s: ArrowSegment): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
  return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
}

class ArrowRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: ArrowPrimitive) {}

  draw(target: DrawTarget) {
    const seg = this.owner.getSegment();
    const data = this.owner.getData();
    if (!seg || !data) return;
    const preview = this.owner.isPreview;
    const selected = this.owner.isSelected;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const ax = seg.ax * hr;
      const ay = seg.ay * vr;
      const bx = seg.bx * hr;
      const by = seg.by * vr;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) return;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      // Head shrinks on very short arrows so it never overshoots the tail
      const headLen = Math.min(HEAD_LENGTH * hr, len * 0.6);
      const headHalf = headLen * (HEAD_HALF_WIDTH / HEAD_LENGTH);
      const baseX = bx - ux * headLen;
      const baseY = by - uy * headLen;

      ctx.save();
      ctx.strokeStyle = data.color;
      ctx.fillStyle = data.color;
      ctx.lineWidth = LINE_WIDTH * hr;
      ctx.lineCap = "round";
      if (preview) ctx.setLineDash([4 * hr, 3 * hr]);

      // Shaft stops at the head's base so the round cap doesn't poke through the tip
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(baseX, baseY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(baseX - uy * headHalf, baseY + ux * headHalf);
      ctx.lineTo(baseX + uy * headHalf, baseY - ux * headHalf);
      ctx.closePath();
      ctx.fill();

      if (selected) {
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, hr);
        for (const [x, y] of [
          [ax, ay],
          [bx, by],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, HANDLE_RADIUS * hr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }
}

class ArrowPaneView implements IPrimitivePaneView {
  private readonly _renderer: ArrowRenderer;
  constructor(owner: ArrowPrimitive) {
    this._renderer = new ArrowRenderer(owner);
  }
  renderer() {
    return this._renderer;
  }
}

/**
 * An arrow from a tail to a head, both anchored to (time, price) coordinates on the candle
 * series' pane. Same lifecycle as RectanglePrimitive: repaints on its own with pan/zoom.
 */
export class ArrowPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private data: ArrowData | null = null;
  private selected = false;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(readonly isPreview = false) {
    this.views = [new ArrowPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.chart = param.chart as IChartApi;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews() {
    return this.views;
  }

  get isSelected() {
    return this.selected;
  }

  getData() {
    return this.data;
  }

  setData(data: ArrowData | null) {
    this.data = data;
    this.requestUpdate?.();
  }

  setSelected(selected: boolean) {
    if (this.selected === selected) return;
    this.selected = selected;
    this.requestUpdate?.();
  }

  /** Current pixel endpoints, or null when detached / off the loaded time range */
  getSegment(): ArrowSegment | null {
    if (!this.chart || !this.series || !this.data) return null;
    const ts = this.chart.timeScale();
    const ax = ts.timeToCoordinate(this.data.a.time as UTCTimestamp);
    const bx = ts.timeToCoordinate(this.data.b.time as UTCTimestamp);
    const ay = this.series.priceToCoordinate(this.data.a.price);
    const by = this.series.priceToCoordinate(this.data.b.price);
    if (ax === null || bx === null || ay === null || by === null) return null;
    return { ax, ay, bx, by };
  }

  /** Hit-test a pane-relative point. Endpoint handles only count while selected. */
  hitRegion(x: number, y: number): ArrowHit | null {
    const seg = this.getSegment();
    if (!seg) return null;
    if (this.selected) {
      if (Math.hypot(x - seg.bx, y - seg.by) <= HANDLE_HIT_RADIUS) return "b";
      if (Math.hypot(x - seg.ax, y - seg.ay) <= HANDLE_HIT_RADIUS) return "a";
    }
    return distanceToSegment(x, y, seg) <= BODY_HIT_DISTANCE ? "body" : null;
  }
}
