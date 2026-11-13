import { DestroyRef, Injectable, NgZone, computed, effect, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import { Subject } from 'rxjs';
import { bearing, formatDistance } from '../../shared/utils/geo';
import { clamp } from '../../shared/utils/math';
import { HOME_CONFIG } from '../home.config';
import { I18nService, Translatable } from '../../core/i18n/i18n.service';
import { Hotspot, PlannedRoute } from '../models/home.models';
import { HomeStore } from '../state/home.store';
import { RoutePlannerService } from './route-planner.service';
import { ToastService } from './toast.service';

export type TripStatus = 'idle' | 'driving' | 'paused';
export type Turn = 'left' | 'right' | 'straight';

export interface NavHint {
  distance: string;
  /** Instruction from the routing service (already in the app language); null = towards the destination. */
  text: string | null;
  turn: Turn;
}

/** Position of the car on one animation frame. */
export interface TripFrame {
  position: L.LatLng;
  heading: number;
  /** Route still to drive; only set a few times per second. */
  remaining?: L.LatLng[];
}

/**
 * Driver position, the recommended route and the driving simulation
 * (the simulation logic comes from main.html / the route finder).
 * Provided by HomeComponent.
 */
@Injectable()
export class TripService {
  private readonly store = inject(HomeStore);
  private readonly planner = inject(RoutePlannerService);
  private readonly toast = inject(ToastService);
  private readonly zone = inject(NgZone);
  private readonly i18n = inject(I18nService);

  /** Where the driver stands while no trip is running (dummy GPS: click the map to move). */
  readonly driverPosition = signal(L.latLng(HOME_CONFIG.driverStart.lat, HOME_CONFIG.driverStart.lng));
  readonly route = signal<PlannedRoute | null>(null);
  readonly status = signal<TripStatus>('idle');
  readonly speedKmh = signal<number>(HOME_CONFIG.speedOptions[0]);
  readonly follow = signal(true);
  readonly info = signal<Translatable | null>(null);
  readonly nav = signal<NavHint | null>(null);

  readonly active = computed(() => this.status() !== 'idle');
  readonly canStart = computed(() => (this.route()?.path.length ?? 0) > 1);

  private readonly frames = new Subject<TripFrame>();
  /** Emits on every animation frame while driving, outside the Angular zone (no change detection). */
  readonly frames$ = this.frames.asObservable();

  private livePosition = this.driverPosition();
  private travelled = 0;
  private seg = 0;
  private rafId = 0;
  private lastFrame = 0;
  private lastUiUpdate = 0;
  private routeKey = '';
  private request = 0;

  constructor() {
    // Re-plan when the forecast (hotspots) or the driver's position changes, debounced.
    effect((onCleanup) => {
      const hotspots = this.store.hotspots();
      const from = this.driverPosition();
      const timer = setTimeout(() => void this.replan(hotspots, from), 350);
      onCleanup(() => clearTimeout(timer));
    });

    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.rafId);
      this.frames.complete();
    });
  }

  /** Position of the car right now (also while driving). */
  currentPosition(): L.LatLng {
    return this.active() ? this.livePosition : this.driverPosition();
  }

  /** The part of the route that still has to be driven. */
  remainingPath(): L.LatLng[] {
    const route = this.route();
    if (!route) return [];
    return this.active() ? [this.livePosition, ...route.path.slice(this.seg + 1)] : route.path;
  }

  /** Start, pause or resume the recommended route. */
  toggle(): void {
    if (this.status() === 'driving') {
      cancelAnimationFrame(this.rafId);
      this.status.set('paused');
      return;
    }
    if (!this.canStart()) return;
    if (this.status() === 'idle') this.livePosition = this.driverPosition();
    this.status.set('driving');
    this.updateNav();
    this.lastFrame = performance.now();
    this.zone.runOutsideAngular(() => (this.rafId = requestAnimationFrame(this.tick)));
  }

  /** End the trip where the car is now; a new route is planned from there. */
  stop(): void {
    if (!this.active()) return;
    this.endTrip(this.livePosition);
    this.toast.show('toast.tripStopped');
  }

  /** Simulated GPS: put the driver somewhere else. */
  moveDriver(position: L.LatLng): void {
    if (this.active()) {
      this.toast.show('toast.endTripFirst');
      return;
    }
    this.driverPosition.set(position);
    this.toast.show('toast.driverMoved');
  }

  // ---------- Planning ----------
  private async replan(hotspots: Hotspot[], idlePosition: L.LatLng): Promise<void> {
    const active = this.active();
    const from = active ? this.livePosition : idlePosition;
    const targets = this.planner.pickStops(from, hotspots);
    // Same stops as now? Then only refresh their demand. (While driving, the position may change freely.)
    const key = targets.map((t) => t.id).join('|') + (active ? '' : `@${from.lat.toFixed(4)},${from.lng.toFixed(4)}`);
    if (key === this.routeKey) {
      this.route.update((r) => r && {
        ...r,
        stops: r.stops.map((s) => {
          const t = targets.find((x) => x.id === s.id);
          return t ? { ...s, intensity: t.intensity, reason: t.reason } : s;
        }),
      });
      return;
    }
    this.routeKey = key;
    if (!targets.length) return;

    const request = ++this.request;
    this.info.set({ key: 'trip.calculating' });
    const route = await this.planner.plan(from, targets, this.i18n.language());
    if (request !== this.request) return; // a newer request is underway

    this.travelled = 0;
    this.seg = 0;
    this.route.set(route);
    if (route.straightLine) this.info.set({ key: 'trip.straightLine' });
    else this.info.set({ key: this.active() ? 'trip.updated' : 'trip.ready' });
  }

  // ---------- Simulation ----------
  private readonly tick = (t: number): void => {
    const route = this.route();
    if (!route) return;
    const dt = Math.min((t - this.lastFrame) / 1000, 0.25); // clamp after the tab was in the background
    this.lastFrame = t;
    this.travelled += (this.speedKmh() / 3.6) * dt;

    if (this.travelled >= route.length) {
      this.zone.run(() => this.arrive(route));
      return;
    }

    const { position, heading } = this.positionAt(route, this.travelled);
    this.livePosition = position;
    const uiDue = t - this.lastUiUpdate > 250;
    this.frames.next({ position, heading, remaining: uiDue ? [position, ...route.path.slice(this.seg + 1)] : undefined });

    const next = route.stops.findIndex((s) => !s.done);
    if (next >= 0 && next < route.stops.length - 1 && this.travelled >= route.stops[next].at - 15) {
      this.zone.run(() => this.passStop(next));
    }
    if (uiDue) {
      this.lastUiUpdate = t;
      this.zone.run(() => this.updateNav());
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private positionAt(route: PlannedRoute, distance: number): { position: L.LatLng; heading: number } {
    const { path, cum } = route;
    while (this.seg < cum.length - 2 && cum[this.seg + 1] < distance) this.seg++;
    const a = path[this.seg];
    const b = path[this.seg + 1];
    const f = clamp((distance - cum[this.seg]) / (cum[this.seg + 1] - cum[this.seg] || 1), 0, 1);
    return {
      position: L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f),
      heading: bearing(a, b),
    };
  }

  private passStop(index: number): void {
    const route = this.route();
    if (!route) return;
    const stop = route.stops[index];
    this.route.set({ ...route, stops: route.stops.map((s, i) => (i === index ? { ...s, done: true } : s)) });
    this.toast.show({ key: 'toast.hotspotReached', params: { name: stop.name } });
  }

  private arrive(route: PlannedRoute): void {
    const end = route.path[route.path.length - 1];
    this.route.set({ ...route, stops: route.stops.map((s) => ({ ...s, done: true })) });
    this.endTrip(end);
    const last = route.stops[route.stops.length - 1];
    this.toast.show({ key: 'toast.routeCompleted', params: { name: last?.name ?? '' } });
  }

  private endTrip(position: L.LatLng): void {
    cancelAnimationFrame(this.rafId);
    this.status.set('idle');
    this.nav.set(null);
    this.routeKey = '';
    this.driverPosition.set(L.latLng(position.lat, position.lng)); // new object → triggers a re-plan
  }

  private updateNav(): void {
    const route = this.route();
    if (!route || !this.active()) {
      this.nav.set(null);
      return;
    }
    const left = route.length - this.travelled;
    const next = route.instructions.find((i) => i.index > this.seg);
    if (next) {
      const distance = route.cum[Math.min(next.index, route.cum.length - 1)] - this.travelled;
      this.nav.set({ distance: formatDistance(distance), text: next.text, turn: toTurn(next.modifier) });
    } else {
      this.nav.set({ distance: formatDistance(left), text: null, turn: 'straight' });
    }
    const mps = this.speedKmh() / 3.6;
    this.info.set({ key: 'trip.progress', params: { km: (left / 1000).toFixed(2), min: Math.ceil(left / mps / 60) } });
  }
}

function toTurn(modifier?: string): Turn {
  if (/left/i.test(modifier ?? '')) return 'left';
  if (/right/i.test(modifier ?? '')) return 'right';
  return 'straight';
}
