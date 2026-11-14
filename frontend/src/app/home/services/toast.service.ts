import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Short messages shown at the bottom of the map. */
@Injectable()
export class ToastService {
  readonly text = signal('');
  readonly visible = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  show(message: string, durationMs = 3200): void {
    this.text.set(message);
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), durationMs);
  }
}
