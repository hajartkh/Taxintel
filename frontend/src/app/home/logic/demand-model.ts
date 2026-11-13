/*
 * Dummy demand model: how busy is each place at time t?
 * Pure functions (no Angular, no Leaflet), so they are easy to test and to
 * replace later by the predictions of the AI model.
 */
import { clamp, gauss } from '../../shared/utils/math';
import { distanceMeters } from '../../shared/utils/geo';
import { HOUR_MS, addMinutes, formatTime, isSameDay } from '../../shared/utils/time';
import { AreaKind, BusyArea, CityEvent, DemandLevel, Hotspot } from '../models/home.models';

/** Typical demand per hour of the day (00:00 … 23:00), 0..1. */
const HOURLY_PROFILES: Record<AreaKind, number[]> = {
  station: [0.15, 0.1, 0.05, 0.05, 0.1, 0.3, 0.6, 0.9, 0.85, 0.5, 0.4, 0.4, 0.45, 0.45, 0.5, 0.6, 0.85, 0.95, 0.7, 0.5, 0.45, 0.4, 0.35, 0.25],
  nightlife: [0.8, 0.7, 0.55, 0.4, 0.2, 0.05, 0.02, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.25, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9],
  shopping: [0, 0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.3, 0.6, 0.75, 0.8, 0.8, 0.85, 0.9, 0.85, 0.6, 0.25, 0.05, 0, 0, 0, 0],
};

const AREA_REASON: Record<AreaKind, string> = {
  station: 'Train arrivals',
  nightlife: 'Nightlife',
  shopping: 'Shoppers',
};

export const DEMAND_LABEL: Record<DemandLevel, string> = {
  high: 'High demand',
  busy: 'Busy',
  mod: 'Moderate',
};

export function demandLevel(intensity: number): DemandLevel {
  if (intensity >= 0.75) return 'high';
  if (intensity >= 0.4) return 'busy';
  return 'mod';
}

function profileAt(profile: number[], t: Date): number {
  const h = t.getHours() + t.getMinutes() / 60;
  const i = Math.floor(h);
  const f = h - i;
  return profile[i % 24] * (1 - f) + profile[(i + 1) % 24] * f;
}

export function areaIntensity(area: BusyArea, t: Date): number {
  let value = area.weight * profileAt(HOURLY_PROFILES[area.kind], t);
  const nightOf = new Date(t.getTime() - 6 * HOUR_MS).getDay(); // 00:00-06:00 belongs to the previous evening
  if (area.kind === 'nightlife' && (nightOf === 5 || nightOf === 6)) value *= 1.35; // Friday and Saturday nights
  if (area.kind === 'shopping' && t.getDay() === 0) value *= 0.2; // shops closed on Sunday
  return value;
}

/** Event size factor based on the expected number of visitors. */
export function eventSize(ev: CityEvent): number {
  return clamp(ev.attendance / 15000, 0.18, 1.2);
}

/** Taxi demand around an event: some when people arrive, a big peak when it lets out. */
export function eventIntensity(ev: CityEvent, t: Date): number {
  const h = (t.getTime() - ev.start.getTime()) / HOUR_MS;
  const duration = (ev.end.getTime() - ev.start.getTime()) / HOUR_MS;
  const arrive = 0.5 * gauss(h, -0.75, 0.6);
  const leave = gauss(h, duration + 0.25, 0.5);
  const during = h >= 0 && h <= duration ? 0.12 : 0;
  return eventSize(ev) * Math.max(arrive, leave, during);
}

/** When most people need a taxi after the event. */
export function peakPickupTime(ev: CityEvent): Date {
  return addMinutes(ev.end, 15);
}

function eventPhase(ev: CityEvent, t: Date): string {
  if (t < ev.start) return `starts ${formatTime(ev.start)}`;
  if (t <= ev.end) return `ends ${formatTime(ev.end)}`;
  return `let out ${formatTime(ev.end)}`;
}

export function eventsOnDay(events: CityEvent[], day: Date): CityEvent[] {
  return events.filter((e) => isSameDay(e.start, day)).sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** All places with demand at time `t`. */
export function computeHotspots(t: Date, areas: BusyArea[], events: CityEvent[]): Hotspot[] {
  const spots: Hotspot[] = areas.map((a) => ({
    id: a.id,
    name: a.name,
    lat: a.lat,
    lng: a.lng,
    spread: a.spread,
    intensity: areaIntensity(a, t),
    reason: AREA_REASON[a.kind],
  }));
  for (const ev of events) {
    const intensity = eventIntensity(ev, t);
    if (intensity < 0.03) continue;
    spots.push({
      id: `ev${ev.id}`,
      name: ev.venue.name,
      lat: ev.venue.lat,
      lng: ev.venue.lng,
      spread: 150 + 230 * Math.sqrt(eventSize(ev)),
      intensity,
      reason: `${ev.name} · ${eventPhase(ev, t)}`,
      eventId: ev.id,
    });
  }
  return spots;
}

/**
 * Merges hotspots that lie close together (e.g. Eilandje + an event at MAS) into one
 * target, sorted from busiest to quietest.
 */
export function clusterHotspots(spots: Hotspot[], radiusM = 450): Hotspot[] {
  const clusters: Hotspot[] = [];
  for (const s of [...spots].sort((a, b) => b.intensity - a.intensity)) {
    const near = clusters.find((c) => distanceMeters(c, s) < radiusM);
    if (near) near.intensity += s.intensity * 0.6;
    else clusters.push({ ...s });
  }
  return clusters;
}
