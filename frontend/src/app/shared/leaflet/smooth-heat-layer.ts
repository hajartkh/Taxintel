import * as L from 'leaflet';

export interface SmoothHeatOptions {
  /** Radius of every point on the ground, in metres (stays the same size at every zoom). */
  radiusM: number;
  /** Colour stops 0..1 (0 = transparent edge, 1 = centre of the busiest hotspot). */
  gradient: Record<number, string>;
  /** Point weight that already gives full intensity (lower = redder). */
  max?: number;
  /** Opacity of the centre (0..1); lower = streets stay visible underneath. */
  opacity?: number;
  pane?: string;
}

/** [lat, lng, weight 0..1] */
export type SmoothHeatPoint = [number, number, number];

/**
 * Heatmap that stays soft at every zoom level.
 * leaflet.heat blurs with canvas shadowBlur, which browsers cap, so zoomed in it shows hard circles.
 * This layer draws every point as a radial gradient (any size, always smooth), adds them up in the
 * alpha channel and then colours the result with the gradient.
 */
export class SmoothHeatLayer extends L.Layer {
  private canvas?: HTMLCanvasElement;
  private palette = new Uint8ClampedArray(256 * 4);
  private points: SmoothHeatPoint[] = [];
  declare options: Required<Omit<SmoothHeatOptions, 'pane'>> & { pane: string };

  constructor(options: SmoothHeatOptions) {
    super();
    L.Util.setOptions(this, { max: 1, opacity: 0.55, pane: 'overlayPane', ...options });
    this.buildPalette();
  }

  setPoints(points: SmoothHeatPoint[]): this {
    this.points = points;
    this.redraw();
    return this;
  }

  override onAdd(map: L.Map): this {
    const canvas = (this.canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated'));
    canvas.style.pointerEvents = 'none';
    map.getPane(this.options.pane)!.appendChild(canvas);
    map.on('moveend resize', this.redraw, this);
    map.on('zoomanim', this.animateZoom, this);
    this.redraw();
    return this;
  }

  override onRemove(map: L.Map): this {
    this.canvas?.remove();
    this.canvas = undefined;
    map.off('moveend resize', this.redraw, this);
    map.off('zoomanim', this.animateZoom, this);
    return this;
  }

  private redraw(): void {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, size.x, size.y);
    if (!this.points.length) return;

    // metres -> pixels at the current zoom
    const center = map.getCenter();
    const metresPerDegLng = 111_320 * Math.cos((center.lat * Math.PI) / 180);
    const r = map.latLngToContainerPoint(center).distanceTo(
      map.latLngToContainerPoint([center.lat, center.lng + this.options.radiusM / metresPerDegLng]),
    );

    // 1) Intensity in the alpha channel: Gaussian-like radial gradients, accumulated.
    for (const [lat, lng, weight] of this.points) {
      const p = map.latLngToContainerPoint([lat, lng]);
      if (p.x < -r || p.y < -r || p.x > size.x + r || p.y > size.y + r) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.25, 'rgba(0,0,0,0.8)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
      g.addColorStop(0.75, 'rgba(0,0,0,0.1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, weight / this.options.max);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;

    // 2) Colour: alpha -> palette.
    const image = ctx.getImageData(0, 0, size.x, size.y);
    const px = image.data;
    for (let i = 3; i < px.length; i += 4) {
      const a = px[i];
      if (!a) continue;
      const j = a * 4;
      px[i - 3] = this.palette[j];
      px[i - 2] = this.palette[j + 1];
      px[i - 1] = this.palette[j + 2];
      px[i] = a * this.options.opacity; // linear: the centre is at most `opacity`, the edge still fades to 0
    }
    ctx.putImageData(image, 0, 0);
  }

  /** Scale the existing image during the zoom animation (same as Leaflet's own overlays). */
  private animateZoom(e: L.ZoomAnimEvent): void {
    const map = this._map as L.Map & { _getCenterOffset(c: L.LatLng): L.Point; _getMapPanePos(): L.Point };
    if (!this.canvas) return;
    const scale = map.getZoomScale(e.zoom);
    const offset = map._getCenterOffset(e.center).multiplyBy(-scale).subtract(map._getMapPanePos());
    L.DomUtil.setTransform(this.canvas, offset, scale);
  }

  private buildPalette(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    for (const [stop, color] of Object.entries(this.options.gradient)) g.addColorStop(Number(stop), color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 1);
    this.palette = ctx.getImageData(0, 0, 256, 1).data;
  }
}
