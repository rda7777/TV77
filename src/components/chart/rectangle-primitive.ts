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

export interface RectangleData {
  a: { time: number; price: number };
  b: { time: number; price: number };
  /** Border color (#rrggbb) */
  color: string;
  /** Fill color (#rrggbb), painted at low opacity */
  fillColor: string;
}

/** Pane-relative CSS-pixel box of a rectangle (top < bottom, left < right) */
export interface RectangleBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type RectangleHit = "body" | "tl" | "tr" | "bl" | "br";

const HANDLE_SIZE = 8;
const HANDLE_HIT_RADIUS = 8;
const BODY_HIT_PADDING = 4;

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

class RectangleRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: RectanglePrimitive) {}

  draw(target: DrawTarget) {
    const box = this.owner.getBox();
    const data = this.owner.getData();
    if (!box || !data) return;
    const { color, fillColor } = data;
    const preview = this.owner.isPreview;
    const selected = this.owner.isSelected;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const left = Math.round(box.left * hr);
      const right = Math.round(box.right * hr);
      const top = Math.round(box.top * vr);
      const bottom = Math.round(box.bottom * vr);
      const lineWidth = Math.max(1, Math.round(hr));

      ctx.save();
      ctx.fillStyle = `${fillColor}26`;
      ctx.fillRect(left, top, right - left, bottom - top);

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (preview) ctx.setLineDash([4 * hr, 3 * hr]);
      // Inset by half the stroke so the border isn't clipped at the pane edge
      ctx.strokeRect(left + lineWidth / 2, top + lineWidth / 2, right - left - lineWidth, bottom - top - lineWidth);

      if (selected) {
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff";
        const size = HANDLE_SIZE * hr;
        for (const [x, y] of [
          [left, top],
          [right, top],
          [left, bottom],
          [right, bottom],
        ]) {
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.restore();
    });
  }
}

class RectanglePaneView implements IPrimitivePaneView {
  private readonly _renderer: RectangleRenderer;
  constructor(owner: RectanglePrimitive) {
    this._renderer = new RectangleRenderer(owner);
  }
  renderer() {
    return this._renderer;
  }
}

/**
 * A rectangle anchored to (time, price) coordinates, drawn on the candle series' pane.
 * Being a series primitive it repaints with every pan/zoom/price-scale change on its own.
 */
export class RectanglePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private data: RectangleData | null = null;
  private selected = false;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(readonly isPreview = false) {
    this.views = [new RectanglePaneView(this)];
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

  setData(data: RectangleData | null) {
    this.data = data;
    this.requestUpdate?.();
  }

  setSelected(selected: boolean) {
    if (this.selected === selected) return;
    this.selected = selected;
    this.requestUpdate?.();
  }

  /** Current pixel box, or null when detached / off the loaded time range */
  getBox(): RectangleBox | null {
    if (!this.chart || !this.series || !this.data) return null;
    const ts = this.chart.timeScale();
    const x1 = ts.timeToCoordinate(this.data.a.time as UTCTimestamp);
    const x2 = ts.timeToCoordinate(this.data.b.time as UTCTimestamp);
    const y1 = this.series.priceToCoordinate(this.data.a.price);
    const y2 = this.series.priceToCoordinate(this.data.b.price);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return null;
    return {
      left: Math.min(x1, x2),
      right: Math.max(x1, x2),
      top: Math.min(y1, y2),
      bottom: Math.max(y1, y2),
    };
  }

  /** Hit-test a pane-relative point. Corner handles only count while selected. */
  hitRegion(x: number, y: number): RectangleHit | null {
    const box = this.getBox();
    if (!box) return null;
    if (this.selected) {
      const corners: [RectangleHit, number, number][] = [
        ["tl", box.left, box.top],
        ["tr", box.right, box.top],
        ["bl", box.left, box.bottom],
        ["br", box.right, box.bottom],
      ];
      for (const [hit, cx, cy] of corners) {
        if (Math.hypot(x - cx, y - cy) <= HANDLE_HIT_RADIUS) return hit;
      }
    }
    const inside =
      x >= box.left - BODY_HIT_PADDING &&
      x <= box.right + BODY_HIT_PADDING &&
      y >= box.top - BODY_HIT_PADDING &&
      y <= box.bottom + BODY_HIT_PADDING;
    return inside ? "body" : null;
  }
}
