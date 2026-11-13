import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';

/** Why a hotspot is busy: a station or event and its share of the demand. */
export interface AiHotspotSource {
  kind: 'station' | 'event';
  id: string;
  name: string;
  share: number;
}

/** A hotspot from the backend model (GET /hotspots, see backend/app/hotspots/notes.md). */
export interface AiHotspot {
  location: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  radiusM: number;
  demand: number;
  nearbyDrivers: number;
  /** 0..1: demand / taxis already there. */
  score: number;
  level: 'low' | 'medium' | 'high';
  /** Compared with the same weekday and hour in earlier weeks; null without history. */
  zScore: number | null;
  aboveNormal: boolean;
  sources: AiHotspotSource[];
}

export interface AiHeatCell {
  cell: string;
  /** Centre of the H3 cell. */
  lat: number;
  lng: number;
  demand: number;
}

export interface AiHotspotResult {
  window: { from: string; to: string };
  modelVersion: string;
  hotspots: AiHotspot[];
  heatmap: AiHeatCell[];
}

/** Hotspot predictions of the Python AI service (proxied under /ai, see proxy.conf.json). */
@Injectable({ providedIn: 'root' })
export class AiHotspotsService {
  private readonly http = inject(HttpClient);

  /** Hotspots for the hour starting at `from`; null when the AI service is not running. */
  getHotspots(from: Date, minutes = 60): Observable<AiHotspotResult | null> {
    const to = new Date(from.getTime() + minutes * 60_000);
    return this.http
      .get<AiHotspotResult>('/ai/hotspots', { params: { from: from.toISOString(), to: to.toISOString() } })
      .pipe(catchError(() => of(null)));
  }
}
