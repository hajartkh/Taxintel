import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { ClockService } from '../../core/clock.service';
import { clamp } from '../../shared/utils/math';
import { HOUR_MS, addDays, daysBetween, isSameDay, startOfDay } from '../../shared/utils/time';
import { AiHotspotsService } from '../data/ai-hotspots.service';
import { CityDataService } from '../data/city-data.service';
import { HOME_CONFIG } from '../home.config';
import { computeHotspots, eventsOnDay, peakPickupTime } from '../logic/demand-model';
import { BusyArea, CityEvent, LayerVisibility, MapFocus, MapLayer, MapTheme, Place, Venue } from '../models/home.models';

const THEME_STORAGE_KEY = 'taxintel.mapTheme';

/** The map style the driver picked last time on this device (dark by default). */
function loadMapTheme(): MapTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark'; // storage unavailable (private mode, server rendering)
  }
}

/** Dates are equal when they are the same moment (signals compare by reference otherwise). */
const sameTime = (a: Date, b: Date): boolean => a.getTime() === b.getTime();

/** A moment as (shift day, slot): 05:00 on Saturday belongs to Friday's night shift. */
function toShiftSlot(time: Date): { day: Date; slot: number } {
  let day = startOfDay(time);
  let hours = time.getHours() + time.getMinutes() / 60;
  if (hours < HOME_CONFIG.shiftStartHour) {
    day = addDays(day, -1);
    hours += 24;
  }
  const slot = clamp(Math.round((hours - HOME_CONFIG.shiftStartHour) * 2), 0, HOME_CONFIG.forecastSlots - 1);
  return { day, slot };
}

/**
 * State of the driver home page (selected day, forecast time, map layers …).
 * Provided by HomeComponent, so it lives as long as the page.
 */
@Injectable()
export class HomeStore {
  private readonly cityData = inject(CityDataService);
  private readonly clock = inject(ClockService);
  private readonly ai = inject(AiHotspotsService);

  // ---------- Data ----------
  readonly events = toSignal(this.cityData.getEvents(), { initialValue: [] as CityEvent[] });
  readonly busyAreas = toSignal(this.cityData.getBusyAreas(), { initialValue: [] as BusyArea[] });
  readonly venues = toSignal(this.cityData.getVenues(), { initialValue: [] as Venue[] });

  // ---------- UI state ----------
  /** Selected calendar day; the forecast covers 06:00 that day until 05:30 the next morning. */
  readonly day = signal(startOfDay(new Date()), { equal: sameTime });
  /** Forecast time as a half-hour slot after 06:00 (0 … 47). */
  readonly slot = signal(0);
  /** True while the forecast follows the real clock ("Now"). */
  readonly live = signal(true);
  /** First day shown in the week strip of the calendar. */
  readonly stripStart = signal(startOfDay(new Date()), { equal: sameTime });
  readonly activeEventId = signal<number | null>(null);
  // heat = mock demand model, ai = backend hotspot model (backend/app/hotspots)
  readonly layers = signal<LayerVisibility>({ heat: false, events: true, route: true, ai: true });
  readonly mapTheme = signal<MapTheme>(loadMapTheme());
  /** Forecast card on the map: starts tucked away on phones. */
  readonly forecastOpen = signal(typeof window === 'undefined' || window.innerWidth > 700);

  // ---------- Derived ----------
  readonly forecastTime = computed(
    () => new Date(this.day().getTime() + (HOME_CONFIG.shiftStartHour + this.slot() * 0.5) * HOUR_MS),
  );
  readonly hotspots = computed(() => computeHotspots(this.forecastTime(), this.busyAreas(), this.events()));
  /** Hotspots of the backend AI model for the hour after the forecast time (null = AI service offline). */
  readonly aiHotspots = toSignal(
    toObservable(this.forecastTime).pipe(debounceTime(250), switchMap((time) => this.ai.getHotspots(time))),
    { initialValue: null },
  );
  readonly dayEvents = computed(() => eventsOnDay(this.events(), this.day()));
  readonly hasHiddenLayers = computed(() => Object.values(this.layers()).some((visible) => !visible));
  readonly places = computed<Place[]>(() => [
    ...this.busyAreas().map(({ name, lat, lng }) => ({ name, lat, lng })),
    ...this.venues().map(({ id, name, lat, lng }) => ({ name, lat, lng, venueId: id })),
  ]);

  private readonly focusRequests = new Subject<MapFocus>();
  /** Requests for the map to fly somewhere. */
  readonly focus$ = this.focusRequests.asObservable();

  constructor() {
    this.goLive(this.clock.now());
    // While "Now" is active, follow the real clock.
    effect(
      () => {
        const now = this.clock.now();
        untracked(() => {
          if (this.live()) this.goLive(now);
        });
      },
      { allowSignalWrites: true },
    );
  }

  /** Forecast = right now. */
  goLive(now: Date = new Date()): void {
    const { day, slot } = toShiftSlot(now);
    this.day.set(day);
    this.slot.set(slot);
    this.live.set(true);
    this.showDayInStrip(day);
  }

  setSlot(slot: number): void {
    this.slot.set(clamp(slot, 0, HOME_CONFIG.forecastSlots - 1));
    this.live.set(false);
  }

  selectDay(date: Date): void {
    const day = startOfDay(date);
    this.activeEventId.set(null);
    if (this.live() && isSameDay(day, new Date())) {
      this.goLive();
      return;
    }
    this.day.set(day);
    this.live.set(false);
    this.showDayInStrip(day);
  }

  shiftDay(days: number): void {
    this.selectDay(addDays(this.day(), days));
  }

  /** Select an event: jump the forecast to when it lets out and show it on the map. */
  focusEvent(ev: CityEvent, openPopup: boolean): void {
    this.activeEventId.set(ev.id);
    const { slot } = toShiftSlot(peakPickupTime(ev));
    const day = startOfDay(ev.start); // keep the event's own day selected
    this.day.set(day);
    this.slot.set(slot);
    this.live.set(false);
    this.showDayInStrip(day);
    this.focusRequests.next({ lat: ev.venue.lat, lng: ev.venue.lng, eventId: ev.id, openPopup });
  }

  setMapTheme(theme: MapTheme): void {
    this.mapTheme.set(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // not remembered, but the theme still changes
    }
  }

  toggleLayer(layer: MapLayer): void {
    this.layers.update((l) => ({ ...l, [layer]: !l[layer] }));
  }

  private showDayInStrip(day: Date): void {
    const diff = daysBetween(this.stripStart(), day);
    if (diff < 0 || diff > 6) this.stripStart.set(addDays(this.stripStart(), Math.floor(diff / 7) * 7));
  }
}
