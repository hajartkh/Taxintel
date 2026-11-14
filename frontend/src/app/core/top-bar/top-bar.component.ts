import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatShortDate, formatTime } from '../../shared/utils/time';
import { ClockService } from '../clock.service';
import { DriverService } from '../driver.service';

/** App-wide header: logo, clock, notifications and the driver's account. */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  private readonly clock = inject(ClockService);
  readonly driver = inject(DriverService).profile;

  readonly clockLabel = computed(() => {
    const now = this.clock.now();
    return `${formatShortDate(now)} · ${formatTime(now)}`;
  });
}
