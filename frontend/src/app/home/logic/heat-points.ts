import type { HeatLatLngTuple } from 'leaflet';
import { clamp, seededRandom } from '../../shared/utils/math';
import { Hotspot } from '../models/home.models';

const POINTS_PER_HOTSPOT = 36;
const METERS_PER_DEGREE = 111_320;

// Gaussian scatter per hotspot, cached so the heatmap does not flicker when the time changes.
const offsetCache = new Map<string, Array<[number, number]>>();

function offsetsFor(id: string): Array<[number, number]> {
  let offsets = offsetCache.get(id);
  if (!offsets) {
    const random = seededRandom(id);
    offsets = [];
    for (let k = 0; k < POINTS_PER_HOTSPOT; k++) {
      const r = Math.sqrt(-2 * Math.log(random() || 1e-9));
      const theta = 2 * Math.PI * random();
      offsets.push([r * Math.cos(theta), r * Math.sin(theta)]);
    }
    offsetCache.set(id, offsets);
  }
  return offsets;
}

/** Turns hotspots into weighted points for leaflet.heat. */
export function toHeatPoints(hotspots: Hotspot[]): HeatLatLngTuple[] {
  const points: HeatLatLngTuple[] = [];
  for (const s of hotspots) {
    const degLat = 1 / METERS_PER_DEGREE;
    const degLng = 1 / (METERS_PER_DEGREE * Math.cos((s.lat * Math.PI) / 180));
    const weight = clamp(s.intensity, 0, 1.3) * 0.2;
    for (const [dx, dy] of offsetsFor(s.id)) {
      points.push([s.lat + dy * s.spread * 0.5 * degLat, s.lng + dx * s.spread * 0.5 * degLng, weight]);
    }
  }
  return points;
}
