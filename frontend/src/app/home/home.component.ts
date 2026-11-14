import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { ClockService } from '../core/clock.service';
import { DriverService } from '../core/driver.service';
import { greetingFor } from '../shared/utils/time';
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
  private readonly mapRef = viewChild.required(DemandMapComponent, { read: ElementRef });

  readonly greeting = computed(() => `${greetingFor(this.clock.now())}, ${this.driver().firstName}`);
  readonly startLabel = computed(() => {
    switch (this.trip.status()) {
      case 'driving':
        return 'Pause';
      case 'paused':
        return 'Resume route';
      default:
        return 'Start recommended route';
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
