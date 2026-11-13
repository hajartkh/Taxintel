import { Injectable, computed, signal } from '@angular/core';
import { Translatable } from '../i18n/i18n.service';
import { addDays, addMinutes, atTime, formatTime, toDateInputValue } from '../../shared/utils/time';

export type NotificationKind = 'surge' | 'train' | 'event' | 'earnings' | 'feature';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: Translatable;
  body: Translatable;
  time: Date;
  read: boolean;
}

/**
 * Notifications for the driver. Dummy data for now; later these come from the
 * backend (demand alerts, iRail disturbances, new events).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly items = signal<AppNotification[]>(buildMockNotifications(new Date()));

  readonly notifications = this.items.asReadonly();
  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  markRead(id: number): void {
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  markAllRead(): void {
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
  }
}

function buildMockNotifications(now: Date): AppNotification[] {
  const tomorrow = addDays(now, 1);
  return [
    {
      id: 1,
      kind: 'surge',
      title: { key: 'notif.surge.title', params: { place: 'Sportpaleis' } },
      body: { key: 'notif.surge.body', params: { event: 'Night Lights Tour', time: formatTime(atTime(now, '23:00')) } },
      time: addMinutes(now, -6),
      read: false,
    },
    {
      id: 2,
      kind: 'train',
      title: { key: 'notif.train.title', params: { station: 'Antwerpen-Centraal' } },
      body: { key: 'notif.train.body' },
      time: addMinutes(now, -24),
      read: false,
    },
    {
      id: 3,
      kind: 'event',
      title: { key: 'notif.event.title' },
      body: { key: 'notif.event.body', params: { event: 'Urban Beats Festival', venue: 'Lotto Arena', date: toDateInputValue(tomorrow).split('-').reverse().join('/') } },
      time: addMinutes(now, -95),
      read: false,
    },
    {
      id: 4,
      kind: 'earnings',
      title: { key: 'notif.earnings.title' },
      body: { key: 'notif.earnings.body', params: { amount: 612, trips: 74 } },
      time: addMinutes(now, -60 * 20),
      read: true,
    },
    {
      id: 5,
      kind: 'feature',
      title: { key: 'notif.feature.title' },
      body: { key: 'notif.feature.body' },
      time: addMinutes(now, -60 * 50),
      read: true,
    },
  ];
}
