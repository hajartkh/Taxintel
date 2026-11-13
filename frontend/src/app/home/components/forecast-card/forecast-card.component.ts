import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { formatTime } from '../../../shared/utils/time';
import { HOME_CONFIG } from '../../home.config';
import { HomeStore } from '../../state/home.store';

/** Demand forecast slider; slides out to the right, leaving a small tab with the time. */
@Component({
  selector: 'app-forecast-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './forecast-card.component.html',
  styleUrl: './forecast-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.collapsed]': '!store.forecastOpen()' },
})
export class ForecastCardComponent {
  readonly store = inject(HomeStore);
  private readonly i18n = inject(I18nService);
  readonly maxSlot = HOME_CONFIG.forecastSlots - 1;

  readonly time = computed(() => formatTime(this.store.forecastTime()));
  readonly day = computed(() => {
    const t = this.store.forecastTime();
    return `${this.i18n.relativeDay(t)} · ${this.i18n.shortDate(t)}`;
  });

  toggle(): void {
    this.store.forecastOpen.update((open) => !open);
  }

  onSlide(event: Event): void {
    this.store.setSlot(Number((event.target as HTMLInputElement).value));
  }
}
