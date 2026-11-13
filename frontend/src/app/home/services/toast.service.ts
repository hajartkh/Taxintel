import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Translatable } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations/en';

/** Short messages shown at the bottom of the map (translated when shown). */
@Injectable()
export class ToastService {
  readonly message = signal<Translatable | null>(null);
  readonly visible = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  show(message: TranslationKey | Translatable, durationMs = 3200): void {
    this.message.set(typeof message === 'string' ? { key: message } : message);
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), durationMs);
  }
}
