import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatTime } from '../../shared/utils/time';
import { AuthService } from '../auth/auth.service';
import { ClockService } from '../clock.service';
import { DriverService } from '../driver.service';
import { I18nService } from '../i18n/i18n.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { NotificationService } from '../notifications/notification.service';
import { AccountMenuComponent } from './account-menu/account-menu.component';
import { NotificationsPanelComponent } from './notifications-panel/notifications-panel.component';

type Panel = 'notifications' | 'account';

/** App-wide header: logo, clock, notifications and the driver's account. */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink, TranslatePipe, NotificationsPanelComponent, AccountMenuComponent],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'openPanel.set(null)',
  },
})
export class TopBarComponent {
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly auth = inject(AuthService);
  readonly notifications = inject(NotificationService);
  readonly driver = inject(DriverService).profile;

  /** Which drop-down is open (only one at a time). */
  readonly openPanel = signal<Panel | null>(null);

  readonly clockLabel = computed(() => {
    const now = this.clock.now();
    return `${this.i18n.shortDate(now)} · ${formatTime(now)}`;
  });

  toggle(panel: Panel): void {
    this.openPanel.update((open) => (open === panel ? null : panel));
  }

  onDocumentClick(event: MouseEvent): void {
    const user = this.host.nativeElement.querySelector('.user');
    if (this.openPanel() && user && !user.contains(event.target as Node)) this.openPanel.set(null);
  }
}
