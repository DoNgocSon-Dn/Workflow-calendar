export type NotificationType =
  | 'message'
  | 'task'
  | 'group_invitation'
  | 'event_invitation'
  | 'event_update'
  | 'reminder'
  | 'mention'
  | 'deadline'
  | 'system';

export type NotificationCategory = 'message' | 'task' | 'event' | 'group';

export type NotificationResponseStatus = 'accepted' | 'declined';

export type NotificationActionStatus = 'pending' | NotificationResponseStatus;

export interface NotificationSender {
  readonly name: string;
  readonly email?: string;
  readonly avatarUrl?: string;
}

/** Extra fields carried only by `type: 'message'` notifications — enough to
 *  render the chat-style row and to reopen the exact conversation. */
export interface MessageNotificationMetadata {
  readonly senderId: string;
  readonly senderName: string;
  readonly senderAvatar?: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly messageId: string;
  readonly messagePreview: string;
}

export interface AppNotification {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  /** ISO timestamp. */
  readonly createdAt: string;
  readonly isRead: boolean;
  readonly sender?: NotificationSender;
  /** Id of the entity this notification points to (event id, task id, group id...). */
  readonly relatedId?: string;
  /** Only set for notifications that offer Accept/Decline actions. */
  readonly actionStatus?: NotificationActionStatus;
  readonly metadata?: Readonly<Record<string, string>>;
  /** Present exactly when `type === 'message'`. */
  readonly messageMeta?: MessageNotificationMetadata;
}

export interface NotificationRespondPayload {
  readonly id: string;
  readonly status: NotificationResponseStatus;
}

/** Dữ liệu để tạo một notification mới. `id` phải ổn định và suy ra được từ
 *  sự kiện nguồn (vd. `message-<messageId>`) để cùng một event realtime nhận
 *  lại nhiều lần không bao giờ sinh ra bản trùng. `createdAt` nên lấy timestamp
 *  của backend, không phải thời điểm client nhận được event. */
export type NotificationDraft = Omit<AppNotification, 'isRead'>;

const CATEGORY_BY_TYPE: Readonly<Record<NotificationType, NotificationCategory | null>> = {
  message: 'message',
  task: 'task',
  group_invitation: 'group',
  event_invitation: 'event',
  event_update: 'event',
  reminder: 'event',
  // Mention luôn gắn với một công việc cụ thể trong app này nên xếp vào tab
  // "Công việc" thay vì để trôi ra ngoài mọi bộ lọc.
  mention: 'task',
  deadline: 'task',
  system: null,
};

export function notificationCategory(type: NotificationType): NotificationCategory | null {
  return CATEGORY_BY_TYPE[type];
}

/** "Vừa xong" / "5 phút trước" / "1 giờ trước" / "Hôm qua" / absolute date. */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Hôm qua';
  if (diffDay < 7) return `${diffDay} ngày trước`;

  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
