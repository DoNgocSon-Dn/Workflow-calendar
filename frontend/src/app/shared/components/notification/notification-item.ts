import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  AppNotification,
  NotificationRespondPayload,
  NotificationType,
  formatNotificationTime,
} from '../../../core/services/notification.model';

/** Nhóm màu nhấn — mỗi loại thông báo mang một "chất" riêng để liếc qua là
 *  đoán được đó là việc gì, nhưng vẫn chung một ngôn ngữ thiết kế. */
type NotificationAccent = 'event' | 'reminder' | 'message' | 'task' | 'deadline' | 'group' | 'system';

interface NotificationVisual {
  readonly path: string;
  readonly accent: NotificationAccent;
}

const VISUAL_BY_TYPE: Readonly<Record<NotificationType, NotificationVisual>> = {
  event_invitation: {
    path: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zm-6-7h-2v2H9v2h2v2h2v-2h2v-2h-2z',
    accent: 'event',
  },
  event_update: {
    path: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14z',
    accent: 'event',
  },
  reminder: {
    path: 'M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1z',
    accent: 'reminder',
  },
  message: {
    path: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
    accent: 'message',
  },
  mention: {
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.84 0 3.4-.42 4.66-1.17l-.65-1.55c-1 .6-2.4.97-4.01.97-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8v.5c0 .83-.67 1.5-1.5 1.5S17 13.33 17 12.5V8h-1.5v.77C15 8.3 14.06 8 13 8c-2.21 0-4 1.79-4 4s1.79 4 4 4c1.06 0 2-.42 2.71-1.11.51.68 1.32 1.11 2.29 1.11 1.66 0 3-1.34 3-3v-.5c0-5.52-4.48-10-10-10zm0 12.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    accent: 'message',
  },
  task: {
    path: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    accent: 'task',
  },
  deadline: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h4v2h-6V6h2z',
    accent: 'deadline',
  },
  conflict: {
    path: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    accent: 'deadline',
  },
  group_invitation: {
    path: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    accent: 'group',
  },
  system: {
    path: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    accent: 'system',
  },
};

/** Một nhịp đồng hồ DÙNG CHUNG cho mọi card, thay vì mỗi card tự chạy timer —
 *  đếm ngược và nhãn "5 phút trước" phải tự trôi mà không tốn N interval. */
const nowTick = signal(Date.now());
setInterval(() => nowTick.set(Date.now()), 30_000);

@Component({
  selector: 'app-notification-item',
  templateUrl: './notification-item.html',
  styleUrl: './notification-item.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationItem {
  protected readonly i18n = inject(TranslationService);

  readonly notification = input.required<AppNotification>();
  /** Đang chờ backend xác nhận Chấp nhận/Từ chối. */
  readonly responding = input<boolean>(false);

  readonly activate = output<AppNotification>();
  readonly respond = output<NotificationRespondPayload>();
  readonly dismiss = output<AppNotification>();

  protected readonly timeLabel = computed(() =>
    formatNotificationTime(this.notification().createdAt, new Date(nowTick()), (k, v) => this.i18n.t(k, v)),
  );

  protected readonly visual = computed<NotificationVisual>(() => VISUAL_BY_TYPE[this.notification().type]);

  /** Deadline quá hạn dùng tông đỏ thay vì cam — cùng loại nhưng khác mức độ. */
  protected readonly accent = computed<string>(() => {
    const current = this.notification();
    if (current.type === 'deadline' && current.metadata?.['overdue'] === 'true') return 'overdue';
    if (current.type === 'system') {
      const level = current.metadata?.['level'];
      if (level === 'maintenance') return 'deadline';
      if (level === 'warning') return 'overdue';
    }
    return this.visual().accent;
  });

  protected readonly senderInitial = computed<string | null>(() => {
    const name = this.notification().sender?.name;
    return name ? name.charAt(0).toUpperCase() : null;
  });

  protected readonly senderAvatar = computed<string | null>(
    () => this.notification().sender?.avatarUrl ?? this.notification().messageMeta?.senderAvatar ?? null,
  );

  protected readonly messageMeta = computed(() => this.notification().messageMeta ?? null);

  /** "Còn 15 phút" cho việc sắp diễn ra — người dùng phải nắm được trong dưới
   *  một giây là còn bao lâu, không phải tự trừ giờ trong đầu. */
  protected readonly countdown = computed<string | null>(() => {
    const target = this.notification().metadata?.['startAt'] ?? this.notification().metadata?.['dueDate'];
    if (!target) return null;

    const diffMs = new Date(target).getTime() - nowTick();
    if (Number.isNaN(diffMs)) return null;

    if (diffMs < 0) {
      const overdueMin = Math.floor(-diffMs / 60_000);
      if (overdueMin < 60) return this.i18n.t('notif.lateMinutes', { n: overdueMin });
      const overdueHours = Math.floor(overdueMin / 60);
      return overdueHours < 24
        ? this.i18n.t('notif.lateHours', { n: overdueHours })
        : this.i18n.t('notif.lateDays', { n: Math.floor(overdueHours / 24) });
    }

    const min = Math.round(diffMs / 60_000);
    if (min < 1) return this.i18n.t('notif.startingSoon');
    if (min < 60) return this.i18n.t('notif.inMinutes', { n: min });
    const hours = Math.floor(min / 60);
    if (hours < 24) return this.i18n.t('notif.inHours', { n: hours });
    return this.i18n.t('notif.inDays', { n: Math.floor(hours / 24) });
  });

  protected readonly isActionable = computed(
    () =>
      (this.notification().type === 'group_invitation' || this.notification().type === 'event_invitation') &&
      this.notification().actionStatus === 'pending',
  );

  protected readonly actionStatusLabel = computed<string | null>(() => {
    const status = this.notification().actionStatus;
    if (status === 'accepted') return this.i18n.t('notif.accepted');
    if (status === 'declined') return this.i18n.t('notif.declined');
    return null;
  });

  protected readonly acceptLabel = computed(() =>
    this.notification().type === 'event_invitation' ? this.i18n.t('notif.join') : this.i18n.t('notif.accept'),
  );

  onActivate(): void {
    this.activate.emit(this.notification());
  }

  onAccept(event: MouseEvent): void {
    event.stopPropagation();
    if (this.responding()) return;
    this.respond.emit({ id: this.notification().id, status: 'accepted' });
  }

  onDecline(event: MouseEvent): void {
    event.stopPropagation();
    if (this.responding()) return;
    this.respond.emit({ id: this.notification().id, status: 'declined' });
  }

  onDismiss(event: MouseEvent): void {
    event.stopPropagation();
    this.dismiss.emit(this.notification());
  }
}
