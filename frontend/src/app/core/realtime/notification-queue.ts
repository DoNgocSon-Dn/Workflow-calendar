import { Injectable, computed, signal } from '@angular/core';

export type NotificationKind = 'created' | 'updated' | 'deleted' | 'reminder';

export interface NotificationItem {
  id: string;
  eventId: string;
  title: string;
  body: string;
  kind: NotificationKind;
  reminderId?: string;
}

const SNOOZE_MS = 5 * 60 * 1000;
const MAX_VISIBLE = 2;

@Injectable({ providedIn: 'root' })
export class NotificationQueue {
  readonly queue = signal<NotificationItem[]>([]);
  readonly visible = computed(() => this.queue().slice(0, MAX_VISIBLE));

  /** Nếu 1 reminder có reminderId (đến từ backend), gọi API snooze thật thay
   * vì chỉ hẹn giờ lại cục bộ — set bởi CalendarStore để tránh phụ thuộc
   * vòng (store phụ thuộc queue, không phải ngược lại). */
  onSnoozeReminder: ((reminderId: string, minutes: number) => void) | null = null;

  push(item: Omit<NotificationItem, 'id'>): void {
    const full: NotificationItem = { ...item, id: crypto.randomUUID() };
    this.queue.update((list) => [...list, full]);
    this.notifyBrowserIfHidden(full);
  }

  dismiss(id: string): void {
    this.queue.update((list) => list.filter((n) => n.id !== id));
  }

  snooze(id: string): void {
    const item = this.queue().find((n) => n.id === id);
    this.dismiss(id);
    if (!item) return;

    if (item.reminderId && this.onSnoozeReminder) {
      this.onSnoozeReminder(item.reminderId, SNOOZE_MS / 60_000);
      return;
    }

    setTimeout(() => {
      this.push({ eventId: item.eventId, title: item.title, body: item.body, kind: item.kind });
    }, SNOOZE_MS);
  }

  requestPermission(): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }

  private notifyBrowserIfHidden(item: NotificationItem): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    new Notification(item.title, { body: item.body });
  }
}
