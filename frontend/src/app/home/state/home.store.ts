import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { ClockService } from '../../core/clock.service';
import { clamp } from '../../shared/utils/math';
import { HOUR_MS, addDays, daysBetween, isSameDay, startOfDay, startOfWeek } from '../../shared/utils/time';
import { CityDataService } from '../../core/city-data/city-data.service';
import { BusyArea, CityEvent, Venue } from '../../core/city-data/city.models';
import { HOME_CONFIG } from '../home.config';
import { computeHotspots, eventsOnDay, peakPickupTime } from '../logic/demand-model';
import { LayerVisibility, MapFocus, MapLayer, Place } from '../models/home.models';

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
  /**
   * Page of the week strip: 0 = today and the six days after it (default);
   * 1, 2 … = the following weeks, Monday to Sunday.
   */
  readonly weekOffset = signal(0);
  readonly activeEventId = signal<number | null>(null);
  readonly layers = signal<LayerVisibility>({ heat: true, events: true, route: true });
  /** Forecast card on the map: starts tucked away on phones. */
  readonly forecastOpen = signal(typeof window === 'undefined' || window.innerWidth > 700);

  // ---------- Derived ----------
  /** First day shown in the week strip. */
  readonly stripStart = computed(() => {
    const today = startOfDay(this.clock.now());
    const offset = this.weekOffset();
    return offset === 0 ? today : addDays(startOfWeek(today), 7 * offset);
  }, { equal: sameTime });
  readonly forecastTime = computed(
    () => new Date(this.day().getTime() + (HOME_CONFIG.shiftStartHour + this.slot() * 0.5) * HOUR_MS),
  );
  readonly hotspots = computed(() => computeHotspots(this.forecastTime(), this.busyAreas(), this.events()));
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

  /** Page the week strip (−1 / +1) and select its first day. Week 0 (starting today) is the earliest. */
  shiftWeek(direction: number): void {
    const offset = Math.max(0, this.weekOffset() + direction);
    if (offset === this.weekOffset()) return;
    this.weekOffset.set(offset);
    this.selectDay(this.stripStart());
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

  toggleLayer(layer: MapLayer): void {
    this.layers.update((l) => ({ ...l, [layer]: !l[layer] }));
  }

  /** Make sure the week strip shows `day` (days before today fall back to week 0). */
  private showDayInStrip(day: Date): void {
    const position = daysBetween(this.stripStart(), day);
    if (position >= 0 && position <= 6) return; // already visible
    const today = startOfDay(this.clock.now());
    const fromToday = daysBetween(today, day);
    const offset = fromToday <= 6 ? 0 : Math.round(daysBetween(startOfWeek(today), startOfWeek(day)) / 7);
    this.weekOffset.set(offset);
  }
}
