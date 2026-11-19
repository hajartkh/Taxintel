import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { ClockService } from '../core/clock.service';
import { DriverService } from '../core/driver.service';
import { I18nService } from '../core/i18n/i18n.service';
import { partOfDay } from '../shared/utils/time';
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
  imports: [DemandMapComponent, CityCalendarComponent, SmartRouteComponent],
  providers: [HomeStore, TripService, ToastService],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly trip = inject(TripService);
  readonly driver = inject(DriverService).profile;
  private readonly clock = inject(ClockService);
  readonly t = inject(I18nService).t;
  private readonly mapRef = viewChild.required(DemandMapComponent, { read: ElementRef });

  readonly greeting = computed(() => this.t(`greeting.${partOfDay(this.clock.now())}`, { name: this.driver().firstName }));
  readonly startLabel = computed(() => {
    switch (this.trip.status()) {
      case 'driving':
        return this.t('home.pause');
      case 'paused':
        return this.t('home.resume');
      default:
        return this.t('home.start');
    }
  });

  onStart(): void {
    const starting = this.trip.status() === 'idle';
    this.trip.toggle();
    // On a phone the panel sits below the map: bring the map into view.
    if (starting && window.innerWidth <= 1000) {
      (this.mapRef().nativeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }
}
