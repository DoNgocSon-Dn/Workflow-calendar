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

/** Hàm tra chuỗi dịch. Truyền vào thay vì inject TranslationService để hàm
 *  này vẫn thuần và test được, đồng thời model không phải phụ thuộc Angular. */
export type TranslateFn = (key: string, vars?: Readonly<Record<string, string | number>>) => string;

/** "Vừa xong" / "5 phút trước" / "1 giờ trước" / "Hôm qua" / ngày tuyệt đối.
 *  Không truyền `translate` thì rơi về tiếng Việt như trước. */
export function formatNotificationTime(
  iso: string,
  now: Date = new Date(),
  translate?: TranslateFn,
): string {
  const t: TranslateFn = translate ?? ((key, vars) => {
    const fallback: Record<string, string> = {
      'notif.timeJustNow': 'Vừa xong',
      'notif.timeMinutesAgo': '{n} phút trước',
      'notif.timeHoursAgo': '{n} giờ trước',
      'notif.timeYesterday': 'Hôm qua',
      'notif.timeDaysAgo': '{n} ngày trước',
    };
    return (fallback[key] ?? key).replace('{n}', String(vars?.['n'] ?? ''));
  });

  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return t('notif.timeJustNow');
  if (diffMin < 60) return t('notif.timeMinutesAgo', { n: diffMin });

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t('notif.timeHoursAgo', { n: diffHour });

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return t('notif.timeYesterday');
  if (diffDay < 7) return t('notif.timeDaysAgo', { n: diffDay });

  // Ngày tuyệt đối cũng theo ngôn ngữ đang chọn, không cứng vi-VN.
  const dateLocale = translate ? translate('common.dateLocale') : 'vi-VN';
  return new Intl.DateTimeFormat(dateLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}
