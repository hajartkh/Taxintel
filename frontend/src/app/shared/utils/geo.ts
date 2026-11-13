export interface LatLngLike {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLngLike, b: LatLngLike): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Compass heading from `a` to `b` in degrees (0 = north, clockwise). */
export function bearing(a: LatLngLike, b: LatLngLike): number {
  const dLng = (b.lng - a.lng) * RAD;
  const y = Math.sin(dLng) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLng);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** "350 m" or "2.4 km". */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.max(0, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}
