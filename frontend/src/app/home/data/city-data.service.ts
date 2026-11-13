import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, tap, timer } from 'rxjs';
import { EventDto, EventsService } from '../../events/events.service';
import { DAY_MS, MINUTE_MS, startOfDay } from '../../shared/utils/time';
import { HOME_CONFIG } from '../home.config';
import { BusyArea, CityEvent, Venue } from '../models/home.models';
import { dropSimultaneous, toCityEvent } from './event-mapper';
import { MOCK_BUSY_AREAS } from './mock-city-data';

/**
 * Data source for the home page.
 *   events, venues  real data: GET /api/events (MongoDB, filled by backend/scrapers), see event-mapper.ts
 *   busy areas      still dummy data; to be replaced by /irail/crowding
 */
@Injectable({ providedIn: 'root' })
export class CityDataService {
  private readonly eventsApi = inject(EventsService);

  /** True when the last request for events failed (backend down, database not reachable, …). */
  readonly eventsFailed = signal(false);

  /** Every backend event keeps the same numeric id for as long as the app is open, also after a refresh. */
  private readonly ids = new Map<string, number>();

  /** Loaded once and then refreshed regularly; shared by everyone who asks for events or venues. */
  private readonly events$ = timer(0, HOME_CONFIG.eventsRefreshMinutes * MINUTE_MS).pipe(
    switchMap(() => {
      const today = startOfDay(new Date());
      const from = new Date(today.getTime() - HOME_CONFIG.eventsDaysBack * DAY_MS);
      const to = new Date(today.getTime() + HOME_CONFIG.eventsDaysAhead * DAY_MS);
      return this.eventsApi.getEvents(from, to).pipe(
        tap(() => this.eventsFailed.set(false)),
        catchError((error) => {
          console.warn('Events could not be loaded from /api/events', error);
          this.eventsFailed.set(true);
          return of([] as EventDto[]);
        }),
      );
    }),
    map((dtos) => this.toCityEvents(dtos)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  getEvents(): Observable<CityEvent[]> {
    return this.events$;
  }

  getBusyAreas(): Observable<BusyArea[]> {
    return of(MOCK_BUSY_AREAS);
  }

  /** The venues that have events, for the search box on the map. */
  getVenues(): Observable<Venue[]> {
    return this.events$.pipe(
      map((events) => [...new Map(events.map((e) => [e.venue.id, e.venue] as const)).values()]),
    );
  }

  private toCityEvents(dtos: EventDto[]): CityEvent[] {
    const events: CityEvent[] = [];
    for (const dto of dtos) {
      let id = this.ids.get(dto._id);
      if (id === undefined) {
        id = this.ids.size + 1;
        this.ids.set(dto._id, id);
      }
      const event = toCityEvent(dto, id, HOME_CONFIG.minEventAttendance);
      if (event) events.push(event);
    }
    return dropSimultaneous(events);
  }
}
