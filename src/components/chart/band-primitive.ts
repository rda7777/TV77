import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

class BandRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: BandPrimitive) {}

  draw(target: DrawTarget) {
    const ys = this.owner.getYs();
    if (!ys) return;
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, verticalPixelRatio: vr }) => {
      const top = Math.round(Math.min(ys[0], ys[1]) * vr);
      const bottom = Math.round(Math.max(ys[0], ys[1]) * vr);
      ctx.fillStyle = this.owner.color;
      ctx.fillRect(0, top, bitmapSize.width, bottom - top);
    });
  }
}

class BandPaneView implements IPrimitivePaneView {
  private readonly _renderer: BandRenderer;
  constructor(owner: BandPrimitive) {
    this._renderer = new BandRenderer(owner);
  }
  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }
  renderer() {
    return this._renderer;
  }
}

/**
 * A horizontal shaded band between two values across the whole pane, drawn behind the series
 * (TradingView's RSI 30–70 background). Keeps both edges inside the autoscaled range.
 */
export class BandPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(
    private readonly from: number,
    private readonly to: number,
    public color: string,
  ) {
    this.views = [new BandPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews() {
    return this.views;
  }

  setColor(color: string) {
    this.color = color;
    this.requestUpdate?.();
  }

  getYs(): [number, number] | null {
    if (!this.series) return null;
    const a = this.series.priceToCoordinate(this.from);
    const b = this.series.priceToCoordinate(this.to);
    return a === null || b === null ? null : [a, b];
  }

  autoscaleInfo() {
    return { priceRange: { minValue: Math.min(this.from, this.to), maxValue: Math.max(this.from, this.to) } };
  }
}
