import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  AppNotification,
  NotificationRespondPayload,
  NotificationType,
  formatNotificationTime,
} from '../../../core/services/notification.model';

type NotificationTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

interface NotificationIcon {
  readonly path: string;
  readonly tone: NotificationTone;
}

const ICON_BY_TYPE: Readonly<Record<NotificationType, NotificationIcon>> = {
  message: {
    path: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
    tone: 'accent',
  },
  task: {
    path: 'M3 5h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zM3 17h2v2H3zm4 0h14v2H7z',
    tone: 'accent',
  },
  group_invitation: {
    path: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    tone: 'success',
  },
  event_invitation: {
    path: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zm-6-7h-2v2H9v2h2v2h2v-2h2v-2h-2z',
    tone: 'accent',
  },
  event_update: {
    path: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14z',
    tone: 'accent',
  },
  reminder: {
    path: 'M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39 6.6 1.86 2 5.71l1.29 1.54 4.59-3.86zM12.5 8H11v6l4.75 2.85.75-1.23-4-2.37V8zM12 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 16a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
    tone: 'warning',
  },
  mention: {
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.84 0 3.4-.42 4.66-1.17l-.65-1.55c-1 .6-2.4.97-4.01.97-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8v.5c0 .83-.67 1.5-1.5 1.5S17 13.33 17 12.5V8h-1.5v.77C15 8.3 14.06 8 13 8c-2.21 0-4 1.79-4 4s1.79 4 4 4c1.06 0 2-.42 2.71-1.11.51.68 1.32 1.11 2.29 1.11 1.66 0 3-1.34 3-3v-.5c0-5.52-4.48-10-10-10zm0 12.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    tone: 'accent',
  },
  deadline: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h4v2h-6V6h2z',
    tone: 'warning',
  },
  system: {
    path: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    tone: 'neutral',
  },
};

@Component({
  selector: 'app-notification-item',
  templateUrl: './notification-item.html',
  styleUrl: './notification-item.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationItem {
  readonly notification = input.required<AppNotification>();
  /** Đang chờ backend xác nhận Chấp nhận/Từ chối. */
  readonly responding = input<boolean>(false);

  readonly activate = output<AppNotification>();
  readonly respond = output<NotificationRespondPayload>();

  protected readonly timeLabel = computed(() => formatNotificationTime(this.notification().createdAt));

  protected readonly icon = computed<NotificationIcon>(() => {
    const current = this.notification();
    const base = ICON_BY_TYPE[current.type];

    if (current.type === 'deadline' && current.metadata?.['overdue'] === 'true') {
      return { path: base.path, tone: 'danger' };
    }
    // Thông báo hệ thống đổi màu theo mức độ để bảo trì/cảnh báo nổi hơn tin thường.
    if (current.type === 'system') {
      const level = current.metadata?.['level'];
      if (level === 'maintenance') return { path: base.path, tone: 'warning' };
      if (level === 'warning') return { path: base.path, tone: 'danger' };
    }
    return base;
  });

  protected readonly senderInitial = computed<string | null>(() => {
    const name = this.notification().sender?.name;
    return name ? name.charAt(0).toUpperCase() : null;
  });

  protected readonly senderAvatar = computed<string | null>(
    () => this.notification().sender?.avatarUrl ?? this.notification().messageMeta?.senderAvatar ?? null,
  );

  /** Thông báo tin nhắn có bố cục riêng (tên người gửi + preview + tên nhóm). */
  protected readonly messageMeta = computed(() => this.notification().messageMeta ?? null);

  protected readonly isActionable = computed(
    () =>
      (this.notification().type === 'group_invitation' || this.notification().type === 'event_invitation') &&
      this.notification().actionStatus === 'pending',
  );

  protected readonly actionStatusLabel = computed<string | null>(() => {
    const status = this.notification().actionStatus;
    if (status === 'accepted') return 'Đã chấp nhận';
    if (status === 'declined') return 'Đã từ chối';
    return null;
  });

  protected readonly acceptLabel = computed(() =>
    this.notification().type === 'event_invitation' ? 'Tham gia' : 'Chấp nhận',
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
}
