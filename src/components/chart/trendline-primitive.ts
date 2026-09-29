import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { TrendLineExtend } from "@/lib/store/chart-store";

export interface TrendLineData {
  a: { time: number; price: number };
  b: { time: number; price: number };
  color: string;
  extend: TrendLineExtend;
}

/** Pane-relative CSS-pixel segment */
export interface TrendSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** Maps a time to a pane x, including times past the last candle (the "future" blank area) */
export type TimeToX = (time: number) => number | null;

const LINE_WIDTH = 2;
const HIT_DISTANCE = 6;

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

function distanceToSegment(px: number, py: number, s: TrendSegment): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
  return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
}

class TrendLineRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: TrendLinePrimitive) {}

  draw(target: DrawTarget) {
    const data = this.owner.getData();
    if (!data) return;
    const preview = this.owner.isPreview;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, mediaSize }) => {
      const seg = this.owner.getDrawnSegment(mediaSize.width);
      if (!seg) return;
      ctx.save();
      ctx.strokeStyle = data.color;
      ctx.lineWidth = LINE_WIDTH * hr;
      ctx.lineCap = "round";
      if (preview) ctx.setLineDash([4 * hr, 3 * hr]);
      ctx.beginPath();
      ctx.moveTo(seg.ax * hr, seg.ay * vr);
      ctx.lineTo(seg.bx * hr, seg.by * vr);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class TrendLinePaneView implements IPrimitivePaneView {
  private readonly _renderer: TrendLineRenderer;
  constructor(owner: TrendLinePrimitive) {
    this._renderer = new TrendLineRenderer(owner);
  }
  renderer() {
    return this._renderer;
  }
}

/**
 * A trend line drawn straight onto the candle pane, like TradingView: it can reach into the
 * blank area past the last candle and, when extended, runs as a ray all the way to the pane edge.
 * Being a pixel-space line it stays straight on the log axis too.
 */
export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private data: TrendLineData | null = null;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(
    private readonly timeToX: TimeToX,
    readonly isPreview = false,
  ) {
    this.views = [new TrendLinePaneView(this)];
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

  getData() {
    return this.data;
  }

  setData(data: TrendLineData | null) {
    this.data = data;
    this.requestUpdate?.();
  }

  /** Pixel positions of the two anchor points (of the given points, or of the current data) */
  getAnchors(
    a = this.data?.a,
    b = this.data?.b,
  ): TrendSegment | null {
    if (!this.series || !a || !b) return null;
    const ax = this.timeToX(a.time);
    const bx = this.timeToX(b.time);
    const ay = this.series.priceToCoordinate(a.price);
    const by = this.series.priceToCoordinate(b.price);
    if (ax === null || bx === null || ay === null || by === null) return null;
    return { ax, ay, bx, by };
  }

  /** The segment actually painted: the anchors, pushed out to the pane edges on extended sides */
  getDrawnSegment(paneWidth = this.chart?.timeScale().width() ?? 0): TrendSegment | null {
    const anchors = this.getAnchors();
    if (!anchors || !this.data) return null;
    // Orient left → right so "left"/"right" extension means the screen sides
    const [l, r] =
      anchors.ax <= anchors.bx
        ? [{ x: anchors.ax, y: anchors.ay }, { x: anchors.bx, y: anchors.by }]
        : [{ x: anchors.bx, y: anchors.by }, { x: anchors.ax, y: anchors.ay }];
    const dx = r.x - l.x;
    if (dx === 0) return { ax: l.x, ay: l.y, bx: r.x, by: r.y };
    const slope = (r.y - l.y) / dx;
    const ext = this.data.extend;
    const left = (ext === "left" || ext === "both") && l.x > 0 ? { x: 0, y: l.y - slope * l.x } : l;
    const right =
      (ext === "right" || ext === "both") && r.x < paneWidth
        ? { x: paneWidth, y: r.y + slope * (paneWidth - r.x) }
        : r;
    return { ax: left.x, ay: left.y, bx: right.x, by: right.y };
  }

  hitsPoint(x: number, y: number): boolean {
    const seg = this.getDrawnSegment();
    return seg !== null && distanceToSegment(x, y, seg) <= HIT_DISTANCE;
  }
}
