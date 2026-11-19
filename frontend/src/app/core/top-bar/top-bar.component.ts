import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { formatShortDate, formatTime } from '../../shared/utils/time';
import { ClockService } from '../clock.service';
import { DriverService } from '../driver.service';
import { I18nService } from '../i18n/i18n.service';
import { NotificationService } from '../notifications/notification.service';
import { AccountMenuComponent } from './account-menu/account-menu.component';
import { NotificationsPanelComponent } from './notifications-panel/notifications-panel.component';

type Menu = 'notifications' | 'account';

/** App-wide header: logo, clock, notifications and the driver's account. */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink, NotificationsPanelComponent, AccountMenuComponent],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class TopBarComponent {
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly driverService = inject(DriverService);
  readonly driver = this.driverService.profile;
  readonly signedIn = this.driverService.signedIn;
  readonly unread = inject(NotificationService).unreadCount;
  readonly t = this.i18n.t;

  /** Which dropdown is open (only one at a time). */
  readonly open = signal<Menu | null>(null);

  readonly clockLabel = computed(() => {
    const now = this.clock.now();
    return `${formatShortDate(now, this.i18n.locale())} · ${formatTime(now)}`;
  });

  constructor() {
    // Close the dropdown when the page changes (e.g. after "Settings").
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.close());
  }

  toggle(menu: Menu): void {
    this.open.update((current) => (current === menu ? null : menu));
  }

  close(): void {
    this.open.set(null);
  }

  /** A click anywhere outside the header closes the dropdown. */
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
