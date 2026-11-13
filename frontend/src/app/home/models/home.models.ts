import type { LatLng } from 'leaflet';
import type { Translatable } from '../../core/i18n/i18n.service';

export type DemandLevel = 'high' | 'busy' | 'mod';
export type MapLayer = 'heat' | 'events' | 'route';
export type LayerVisibility = Record<MapLayer, boolean>;

/** Demand at one place at one moment (output of the demand model). */
export interface Hotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  spread: number;
  /** Roughly 0..1.3; ≥ 0.75 is high demand. */
  intensity: number;
  /** Why it is busy, translated in the UI. */
  reason: Translatable;
  eventId?: number;
}

/** Something the driver can search for on the map. */
export interface Place {
  name: string;
  lat: number;
  lng: number;
  venueId?: string;
}

export interface RouteStop extends Hotspot {
  /** Distance along the route in metres. */
  at: number;
  done: boolean;
}

export interface RouteInstruction {
  /** Index in `PlannedRoute.path` where the manoeuvre happens. */
  index: number;
  text: string;
  modifier?: string;
}

export interface PlannedRoute {
  path: LatLng[];
  /** Cumulative distance in metres at every point of `path`. */
  cum: number[];
  /** Total length in metres. */
  length: number;
  instructions: RouteInstruction[];
  stops: RouteStop[];
  /** True when the routing service could not be reached. */
  straightLine: boolean;
}

/** Ask the map to show a place (and optionally open the event's popup). */
export interface MapFocus {
  lat: number;
  lng: number;
  eventId?: number;
  openPopup: boolean;
}
