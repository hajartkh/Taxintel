export type EventCategory = 'concert' | 'sports' | 'culture' | 'nightlife' | 'fair';
export type AreaKind = 'station' | 'nightlife' | 'shopping';

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** A public event in the city (concert, match, fair …). */
export interface CityEvent {
  id: number;
  name: string;
  venue: Venue;
  category: EventCategory;
  /** Expected number of visitors. */
  attendance: number;
  start: Date;
  end: Date;
}

/** A permanently busy area (station, nightlife, shopping street). */
export interface BusyArea {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: AreaKind;
  /** Peak demand, 0..1. */
  weight: number;
  /** Radius in metres. */
  spread: number;
}
