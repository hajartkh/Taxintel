import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface EventDto { _id: string; name: string; lat: number; lng: number; }

@Injectable({ providedIn: 'root' })
export class EventsService {
  private http = inject(HttpClient);
  getEvents() { return this.http.get<EventDto[]>('/api/events'); }
}