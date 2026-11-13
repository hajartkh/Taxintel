import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import '../../shared/leaflet/leaflet-plugins'; // adds L.Routing
import { Language } from '../../core/settings/settings.service';
import { distanceMeters } from '../../shared/utils/geo';
import { HOME_CONFIG } from '../home.config';
import { clusterHotspots } from '../logic/demand-model';
import { Hotspot, PlannedRoute, RouteInstruction, RouteStop } from '../models/home.models';

/** Fields of an OSRM instruction that the @types package does not declare. */
interface OsrmInstruction extends L.Routing.IInstruction {
  index: number;
  modifier?: string;
}
interface OsrmRoute extends L.Routing.IRoute {
  waypointIndices?: number[];
}

/**
 * Recommends hotspots to drive past and routes them over real streets (OSRM).
 */
@Injectable({ providedIn: 'root' })
export class RoutePlannerService {
  /** One router per language: OSRM's turn-by-turn texts come in the app language. */
  private readonly routers = new Map<Language, L.Routing.IRouter>();

  private router(language: Language): L.Routing.IRouter {
    let router = this.routers.get(language);
    if (!router) {
      router = L.Routing.osrmv1({ serviceUrl: HOME_CONFIG.osrmUrl, profile: 'driving', language } as L.Routing.OSRMOptions);
      this.routers.set(language, router);
    }
    return router;
  }

  /**
   * Best hotspots (demand vs. distance), ordered as a nearest-neighbour tour from `from`.
   * Hotspots within 350 m of the driver are skipped: the driver is already there.
   */
  pickStops(from: L.LatLng, hotspots: Hotspot[]): Hotspot[] {
    const candidates = clusterHotspots(hotspots)
      .filter((c) => distanceMeters(from, c) > 350)
      .map((c) => ({ spot: c, score: c.intensity / (1 + distanceMeters(from, c) / 4000) }));

    let picked = candidates
      .filter((c) => c.spot.intensity >= 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, HOME_CONFIG.maxStops)
      .map((c) => c.spot);
    if (!picked.length) {
      // Quiet hours: still drive towards the two best places.
      picked = candidates.sort((a, b) => b.spot.intensity - a.spot.intensity).slice(0, 2).map((c) => c.spot);
    }

    const ordered: Hotspot[] = [];
    let current: { lat: number; lng: number } = from;
    while (picked.length) {
      picked.sort((a, b) => distanceMeters(current, a) - distanceMeters(current, b));
      const next = picked.shift()!;
      ordered.push(next);
      current = next;
    }
    return ordered;
  }

  /** Street route from `from` past all `targets`. Falls back to straight lines when OSRM is unreachable. */
  plan(from: L.LatLng, targets: Hotspot[], language: Language = 'en'): Promise<PlannedRoute> {
    const points = [from, ...targets.map((t) => L.latLng(t.lat, t.lng))];
    return new Promise((resolve) => {
      this.router(language).route(
        points.map((p) => L.Routing.waypoint(p)),
        (error?: L.Routing.IError, routes?: L.Routing.IRoute[]) => {
          const route = routes?.[0] as OsrmRoute | undefined;
          if (error || !route?.coordinates?.length) {
            resolve(buildRoute(points, [], targets, null, true));
            return;
          }
          resolve(
            buildRoute(
              route.coordinates,
              (route.instructions ?? []) as OsrmInstruction[],
              targets,
              route.waypointIndices ?? null,
              false,
            ),
          );
        },
      );
    });
  }
}

function buildRoute(
  coordinates: L.LatLng[],
  rawInstructions: OsrmInstruction[],
  targets: Hotspot[],
  waypointIndices: number[] | null,
  straightLine: boolean,
): PlannedRoute {
  const path = coordinates.map((c) => L.latLng(c.lat, c.lng));
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i - 1].distanceTo(path[i]));

  // Distance along the route of every stop (waypoint 0 is the driver).
  let searchFrom = 0;
  const stops: RouteStop[] = targets.map((target, i) => {
    const index = waypointIndices?.[i + 1] ?? nearestIndex(path, L.latLng(target.lat, target.lng), searchFrom);
    searchFrom = index;
    return { ...target, at: cum[Math.min(index, cum.length - 1)], done: false };
  });

  const instructions: RouteInstruction[] = rawInstructions.map((i) => ({
    index: i.index,
    text: i.text ?? i.road ?? '',
    modifier: i.modifier,
  }));

  return { path, cum, length: cum[cum.length - 1], instructions, stops, straightLine };
}

function nearestIndex(path: L.LatLng[], point: L.LatLng, from: number): number {
  let best = from;
  let bestDistance = Infinity;
  for (let i = from; i < path.length; i++) {
    const d = point.distanceTo(path[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
