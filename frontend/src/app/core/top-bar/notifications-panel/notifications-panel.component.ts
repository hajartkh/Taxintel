import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ClockService } from '../../clock.service';
import { I18nService } from '../../i18n/i18n.service';
import { NotificationKind, NotificationService } from '../../notifications/notification.service';

/** Dropdown under the bell: the driver's notifications. Clicking one marks it as read. */
@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass', role: 'dialog', '[attr.aria-label]': 't("notif.title")' },
})
export class NotificationsPanelComponent {
  readonly notifications = inject(NotificationService);
  private readonly i18n = inject(I18nService);
  private readonly clock = inject(ClockService);
  readonly t = this.i18n.t;

  readonly items = computed(() => {
    const now = this.clock.now();
    this.i18n.lang(); // re-render the relative times when the language changes
    return this.notifications.all().map((n) => ({
      ...n,
      titleText: this.t(n.title, n.params),
      bodyText: this.t(n.body, n.params),
      ago: this.i18n.relativeTime(n.time, now),
    }));
  });

  /** SVG path per kind: calendar, train, route, info. */
  readonly icons: Record<NotificationKind, string> = {
    event: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    train: 'M6 3h12a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2ZM4 11h16M8 22l2-4M16 22l-2-4',
    route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4',
    system: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  };
}
