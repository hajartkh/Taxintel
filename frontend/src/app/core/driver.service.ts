import { Injectable, signal } from '@angular/core';

export interface DriverProfile {
  firstName: string;
  fullName: string;
  initials: string;
  online: boolean;
  earningsToday: number;
  tripsToday: number;
}

/** The logged-in driver. Dummy data until there is authentication and a driver API. */
@Injectable({ providedIn: 'root' })
export class DriverService {
  readonly profile = signal<DriverProfile>({
    firstName: 'Sam',
    fullName: 'Sam Peeters',
    initials: 'SP',
    online: true,
    earningsToday: 84,
    tripsToday: 12,
  });
}
