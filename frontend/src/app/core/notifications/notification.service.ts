import { Injectable, computed, signal } from '@angular/core';
import { TranslationKey } from '../i18n/i18n.service';

export type NotificationKind = 'event' | 'train' | 'route' | 'system';

/**
 * A notification for the driver. Title and body are translation keys with parameters,
 * so they follow the chosen language (the backend can send the same shape later).
 */
export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: TranslationKey;
  body: TranslationKey;
  params: Record<string, string | number>;
  time: Date;
  read: boolean;
}

const minutesAgo = (m: number): Date => new Date(Date.now() - m * 60_000);

/** Notifications of the driver. Dummy data until the backend pushes real ones. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly items = signal<AppNotification[]>([
    {
      id: 1,
      kind: 'event',
      title: 'notif.event.title',
      body: 'notif.event.body',
      params: { name: 'Night Lights Tour', time: '23:00', venue: 'Sportpaleis' },
      time: minutesAgo(8),
      read: false,
    },
    {
      id: 2,
      kind: 'train',
      title: 'notif.train.title',
      body: 'notif.train.body',
      params: { station: 'Antwerpen-Centraal', count: 3 },
      time: minutesAgo(26),
      read: false,
    },
    {
      id: 3,
      kind: 'route',
      title: 'notif.route.title',
      body: 'notif.route.body',
      params: { place: 'Eilandje' },
      time: minutesAgo(70),
      read: false,
    },
    {
      id: 4,
      kind: 'system',
      title: 'notif.welcome.title',
      body: 'notif.welcome.body',
      params: {},
      time: minutesAgo(26 * 60),
      read: true,
    },
  ]);

  /** Newest first. */
  readonly all = computed(() => [...this.items()].sort((a, b) => b.time.getTime() - a.time.getTime()));
  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  markRead(id: number): void {
    this.items.update((list) => list.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n)));
  }

  markAllRead(): void {
    this.items.update((list) => list.map((n) => (n.read ? n : { ...n, read: true })));
  }
}
