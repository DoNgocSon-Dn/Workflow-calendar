export type NotificationType =
  | 'message'
  | 'task'
  | 'group_invitation'
  | 'group_join_request'
  | 'event_invitation'
  | 'event_update'
  | 'reminder'
  | 'mention'
  | 'deadline'
  | 'conflict'
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

/** A translation param that is itself a translation key — resolved at render
 *  time so nested phrases (a status verb, a role name) also follow the current
 *  language, not the language active when the notification was created. */
export interface NotifKeyRef {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export type NotifParams = Readonly<Record<string, string | number | NotifKeyRef>>;

export function isNotifKeyRef(value: unknown): value is NotifKeyRef {
  return !!value && typeof value === 'object' && typeof (value as NotifKeyRef).key === 'string';
}

/**
 * Resolve a notification's translatable title/message.
 *
 * When `key` is set the text is (re)translated on every render, so switching
 * language updates notifications received earlier too. Falls back to the baked
 * `fallback` string for backend `system` notices and for notifications stored
 * before this field existed.
 */
export function resolveNotifText(
  fallback: string,
  key: string | undefined,
  params: NotifParams | undefined,
  translate: TranslateFn,
): string {
  if (!key) return fallback;
  const flat: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    flat[k] = isNotifKeyRef(v) ? translate(v.key, v.params) : v;
  }
  // Templates like "{title} · {time}" leave a dangling separator when an
  // optional slot resolves to empty — trim it off.
  return translate(key, flat).trim();
}

export interface AppNotification {
  readonly id: string;
  readonly type: NotificationType;
  /** Baked text — kept as the fallback and for backend-authored `system`
   *  notices. When `titleKey`/`messageKey` are present the UI re-translates
   *  from those instead so the text follows the current language. */
  readonly title: string;
  readonly message: string;
  readonly titleKey?: string;
  readonly titleParams?: NotifParams;
  readonly messageKey?: string;
  readonly messageParams?: NotifParams;
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
  group_join_request: 'group',
  event_invitation: 'event',
  event_update: 'event',
  reminder: 'event',
  conflict: 'event',
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
