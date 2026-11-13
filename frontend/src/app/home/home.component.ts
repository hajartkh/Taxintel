import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ClockService } from '../core/clock.service';
import { DriverService } from '../core/driver.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { CityCalendarComponent } from './components/city-calendar/city-calendar.component';
import { DemandMapComponent } from './components/demand-map/demand-map.component';
import { SmartRouteComponent } from './components/smart-route/smart-route.component';
import { ToastService } from './services/toast.service';
import { TripService } from './services/trip.service';
import { HomeStore } from './state/home.store';

/**
 * Driver home page: demand heatmap, recommended route and city calendar.
 * The page-scoped services are provided here, so their state lives as long as the page.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [DemandMapComponent, CityCalendarComponent, SmartRouteComponent, TranslatePipe],
  providers: [HomeStore, TripService, ToastService],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly trip = inject(TripService);
  readonly driver = inject(DriverService).profile;
  private readonly store = inject(HomeStore);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly mapRef = viewChild.required(DemandMapComponent, { read: ElementRef });

  /** `?event=<id>` (e.g. "Show on map" in the month calendar): focus that event. Bound by the router. */
  readonly event = input<string>();

  readonly greeting = computed(() => this.i18n.greeting(this.clock.now(), this.driver().firstName));
  readonly startLabel = computed<TranslationKey>(() => {
    switch (this.trip.status()) {
      case 'driving':
        return 'home.pause';
      case 'paused':
        return 'home.resume';
      default:
        return 'home.start';
    }
  });

  constructor() {
    effect(() => {
      const id = this.event();
      const events = this.store.events();
      if (!id || !events.length) return;
      const ev = events.find((e) => String(e.id) === id);
      untracked(() => {
        if (ev) setTimeout(() => this.store.focusEvent(ev, true)); // after the map has been created
        void this.router.navigate([], { queryParams: { event: null }, queryParamsHandling: 'merge', replaceUrl: true });
      });
    });
  }

  onStart(): void {
    const starting = this.trip.status() === 'idle';
    this.trip.toggle();
    // On a phone the panel sits below the map: bring the map into view.
    if (starting && window.innerWidth <= 1000) {
      (this.mapRef().nativeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }
}
