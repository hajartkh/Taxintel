import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** An event as returned by GET /api/events (MongoDB collection `events`, filled by backend/scrapers). */
export interface EventDto {
  _id: string;
  title: string;
  /** concert, theater, beurs, festival, uitgaan, sport, film, expo, lezing, familie, spel, overig, kamp, cursus, rondleiding */
  category?: string;
  /** ISO, UTC */
  startsAt: string;
  endsAt?: string;
  venue: {
    name: string;
    address?: string;
    city?: string;
    district?: string;
    /** GeoJSON: [lng, lat] */
    location: { type: 'Point'; coordinates: [number, number] };
  };
  url?: string;
  price?: { min: number; currency: string };
  organizer?: string;
  /** series, timeUnknown, soldOut, lastTickets, extraShow */
  flags?: string[];
  source: string;
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly http = inject(HttpClient);

  /** Events that start in [from, to), sorted by start time. */
  getEvents(from?: Date, to?: Date) {
    let params = new HttpParams().set('limit', 5000);
    if (from) params = params.set('from', from.toISOString());
    if (to) params = params.set('to', to.toISOString());
    return this.http.get<EventDto[]>('/api/events', { params });
  }
}
