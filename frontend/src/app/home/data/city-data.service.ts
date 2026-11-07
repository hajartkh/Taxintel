import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { startOfDay } from '../../shared/utils/time';
import { BusyArea, CityEvent, Venue } from '../models/home.models';
import { MOCK_BUSY_AREAS, MOCK_VENUES, buildMockEvents } from './mock-city-data';

/**
 * Data source for the home page.
 * Returns dummy data for now. To switch to the backend, inject HttpClient here and
 * map the responses of /api/events and /irail/crowding to these models; the
 * components do not need to change.
 */
@Injectable({ providedIn: 'root' })
export class CityDataService {
  getEvents(): Observable<CityEvent[]> {
    return of(buildMockEvents(startOfDay(new Date())));
  }

  getBusyAreas(): Observable<BusyArea[]> {
    return of(MOCK_BUSY_AREAS);
  }

  getVenues(): Observable<Venue[]> {
    return of(Object.values(MOCK_VENUES));
  }
}
