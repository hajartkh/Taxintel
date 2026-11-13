import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ClockService } from '../../clock.service';
import { I18nService } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { NotificationKind, NotificationService } from '../../notifications/notification.service';

/** Drop-down list of notifications. Clicking one marks it as read (its yellow dot disappears). */
@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass' },
})
export class NotificationsPanelComponent {
  readonly notifications = inject(NotificationService);
  private readonly i18n = inject(I18nService);
  private readonly clock = inject(ClockService);

  readonly items = computed(() => {
    const now = this.clock.now();
    return this.notifications.notifications().map((n) => ({ ...n, ago: this.i18n.timeAgo(n.time, now) }));
  });

  /** SVG path per kind of notification. */
  readonly icons: Record<NotificationKind, string> = {
    surge: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    train: 'M6 3h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2ZM4 11h16M8 21l2-4M16 21l-2-4',
    event: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
    earnings: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    feature: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5Z',
  };
}
