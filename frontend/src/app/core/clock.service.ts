import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** The current time as a signal, refreshed every 30 seconds. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly current = signal(new Date());
  readonly now = this.current.asReadonly();

  constructor() {
    const id = setInterval(() => this.current.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
