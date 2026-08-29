import { NotifKeyRef, NotifParams, NotificationDraft } from './notification.model';

/**
 * Lớp ADAPTER giữa dữ liệu domain (event, task, tin nhắn...) và Notification
 * Center. Toàn bộ là hàm thuần; store nào nhận được sự kiện realtime thì gọi
 * hàm ở đây rồi đẩy sang `NotificationService.ingest()`.
 *
 * Mỗi hàm nhận `t` (hàm dịch của `TranslationService`). Chuỗi hiển thị vừa
 * được "đóng băng" (`title`/`message` — làm fallback + dùng cho toast tức
 * thời), vừa kèm `titleKey`/`messageKey` + params để `notification-item` DỊCH
 * LẠI mỗi lần render — nên đổi ngôn ngữ sẽ cập nhật cả thông báo nhận từ trước.
 *
 * Mỗi hàm phải sinh ra `id` ỔN ĐỊNH từ chính dữ liệu nguồn: cùng một sự kiện
 * đến lại (socket gửi trùng, reconnect phát lại) sẽ cho ra cùng `id` và bị
 * `ingest()` loại bỏ.
 */

/** Chữ ký hàm dịch — khớp `TranslationService.t`. */
export type NotificationT = (
  key: string,
  vars?: Readonly<Record<string, string | number>>,
) => string;

const PREVIEW_LIMIT = 80;

/** Rút gọn nội dung dài để dòng preview không phá vỡ bố cục item. */
function preview(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…` : text;
}

/** Hash ngắn (djb2) để nhét phần "nội dung đã đổi" vào id mà id không dài ra. */
function shortHash(...parts: readonly string[]): string {
  let hash = 5381;
  const input = parts.join('|');
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

interface Text {
  readonly text: string;
  readonly key: string;
  readonly params?: NotifParams;
}

/** Bake chuỗi ngay bây giờ (fallback) + giữ key/params để dịch lại sau. */
function tr(t: NotificationT, key: string, params?: NotifParams): Text {
  const flat: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    flat[k] = v !== null && typeof v === 'object' ? t((v as NotifKeyRef).key, (v as NotifKeyRef).params) : v;
  }
  return { text: t(key, flat).trim(), key, params };
}

/** Tiêu đề không dịch (tên người gửi...) — chỉ có `text`, không có key. */
function raw(text: string): Text {
  return { text, key: '' };
}

type TextFields = Pick<
  NotificationDraft,
  'title' | 'titleKey' | 'titleParams' | 'message' | 'messageKey' | 'messageParams'
>;

function texts(title: Text, message: Text): TextFields {
  return {
    title: title.text,
    titleKey: title.key || undefined,
    titleParams: title.params,
    message: message.text,
    messageKey: message.key || undefined,
    messageParams: message.params,
  };
}

export interface GroupMessageDraftInput {
  readonly senderId: string;
  readonly senderName: string;
  readonly senderAvatar?: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly messageId: string;
  readonly messageText: string;
  readonly createdAt: string;
}

export function groupMessageDraft(t: NotificationT, input: GroupMessageDraftInput): NotificationDraft {
  return {
    id: `message-${input.messageId}`,
    type: 'message',
    ...texts(raw(input.senderName), tr(t, 'nd.message.body', { group: input.groupName })),
    createdAt: input.createdAt,
    sender: { name: input.senderName, avatarUrl: input.senderAvatar },
    relatedId: input.groupId,
    messageMeta: {
      senderId: input.senderId,
      senderName: input.senderName,
      senderAvatar: input.senderAvatar,
      groupId: input.groupId,
      groupName: input.groupName,
      messageId: input.messageId,
      messagePreview: preview(input.messageText),
    },
  };
}

/** Tin nhắn có nhắc tên/email người dùng hiện tại. */
export function groupMentionDraft(t: NotificationT, input: GroupMessageDraftInput): NotificationDraft {
  return {
    id: `mention-${input.messageId}`,
    type: 'mention',
    ...texts(
      tr(t, 'nd.mention.title', { sender: input.senderName }),
      tr(t, 'nd.mention.body', { group: input.groupName }),
    ),
    createdAt: input.createdAt,
    sender: { name: input.senderName, avatarUrl: input.senderAvatar },
    relatedId: input.groupId,
    messageMeta: {
      senderId: input.senderId,
      senderName: input.senderName,
      senderAvatar: input.senderAvatar,
      groupId: input.groupId,
      groupName: input.groupName,
      messageId: input.messageId,
      messagePreview: preview(input.messageText),
    },
  };
}

export interface GroupTaskDraftInput {
  readonly taskId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly title: string;
  readonly status: 'todo' | 'in_progress' | 'done';
  readonly assignedTo?: string;
  readonly createdAt: string;
}

const TASK_STATUS_KEY: Readonly<Record<GroupTaskDraftInput['status'], string>> = {
  todo: 'nd.taskStatus.todo',
  in_progress: 'nd.taskStatus.inProgress',
  done: 'nd.taskStatus.done',
};

export function groupTaskAssignedDraft(t: NotificationT, input: GroupTaskDraftInput): NotificationDraft {
  return {
    id: `task-assigned-${input.taskId}`,
    type: 'task',
    ...texts(
      tr(t, 'nd.taskAssigned.title'),
      tr(t, 'nd.taskAssigned.body', { title: input.title, group: input.groupName }),
    ),
    createdAt: input.createdAt,
    relatedId: input.taskId,
    metadata: { groupId: input.groupId, taskTitle: input.title },
  };
}

export function groupTaskUpdatedDraft(t: NotificationT, input: GroupTaskDraftInput): NotificationDraft {
  return {
    id: `task-updated-${input.taskId}-${shortHash(input.status, input.assignedTo ?? '')}`,
    type: 'task',
    ...texts(
      tr(t, 'nd.taskUpdated.title'),
      tr(t, 'nd.taskUpdated.body', {
        title: input.title,
        status: { key: TASK_STATUS_KEY[input.status] },
      }),
    ),
    createdAt: input.createdAt,
    relatedId: input.taskId,
    metadata: { groupId: input.groupId, status: input.status },
  };
}

export function groupTaskDeletedDraft(
  t: NotificationT,
  taskId: string,
  title: string,
  groupId: string,
): NotificationDraft {
  return {
    id: `task-deleted-${taskId}`,
    type: 'task',
    ...texts(tr(t, 'nd.taskDeleted.title'), tr(t, 'nd.taskDeleted.body', { title })),
    createdAt: new Date().toISOString(),
    metadata: { groupId },
  };
}

/** Ba mốc deadline, khớp đúng `phase` mà cron backend phát ra. */
export type DeadlinePhase = 'upcoming' | 'due' | 'overdue';

export interface TaskDeadlineDraftInput {
  readonly taskId: string;
  readonly groupId: string;
  readonly groupName?: string | null;
  readonly title: string;
  readonly dueDate: string;
  readonly phase: DeadlinePhase;
  readonly createdAt?: string;
}

const DEADLINE_KEY: Readonly<Record<DeadlinePhase, { title: string; verb: string }>> = {
  upcoming: { title: 'nd.deadline.upcomingTitle', verb: 'nd.deadline.upcomingVerb' },
  due: { title: 'nd.deadline.dueTitle', verb: 'nd.deadline.dueVerb' },
  overdue: { title: 'nd.deadline.overdueTitle', verb: 'nd.deadline.overdueVerb' },
};

export function taskDeadlineDraft(t: NotificationT, input: TaskDeadlineDraftInput): NotificationDraft {
  const keys = DEADLINE_KEY[input.phase];
  const verb: NotifKeyRef = { key: keys.verb };
  return {
    id: `deadline-${input.taskId}-${input.phase}`,
    type: 'deadline',
    ...texts(
      tr(t, keys.title),
      input.groupName
        ? tr(t, 'nd.deadline.bodyInGroup', { title: input.title, group: input.groupName, verb })
        : tr(t, 'nd.deadline.body', { title: input.title, verb }),
    ),
    createdAt: input.createdAt ?? new Date().toISOString(),
    relatedId: input.taskId,
    metadata: {
      groupId: input.groupId,
      phase: input.phase,
      overdue: String(input.phase === 'overdue'),
      dueDate: input.dueDate,
    },
  };
}

export interface GroupInvitationDraftInput {
  readonly inviteId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly inviterEmail: string | null;
  readonly role: string;
  readonly status: 'pending' | 'accepted' | 'declined';
  readonly createdAt: string;
}

export function groupInvitationDraft(t: NotificationT, input: GroupInvitationDraftInput): NotificationDraft {
  return {
    id: `group-invitation-${input.inviteId}`,
    type: 'group_invitation',
    ...texts(
      tr(t, 'nd.groupInvite.title'),
      input.inviterEmail
        ? tr(t, 'nd.groupInvite.bodyFrom', { email: input.inviterEmail, group: input.groupName })
        : tr(t, 'nd.groupInvite.body', { group: input.groupName }),
    ),
    createdAt: input.createdAt,
    sender: input.inviterEmail ? { name: input.inviterEmail, email: input.inviterEmail } : undefined,
    relatedId: input.groupId,
    actionStatus: input.status,
    metadata: { inviteId: input.inviteId, role: input.role },
  };
}

/** Vai trò của CHÍNH người nhận trong một nhóm vừa bị đổi. `role` là khoá thô
 *  từ backend ('LEADER'/'ADMIN'/'MEMBER'/'GUEST', xem GroupRole) — hạ chữ
 *  thường tại đây để khớp khoá i18n `groupRole.<role>`, thay vì import model
 *  GroupRole vào file thuần này chỉ để gọi `groupRoleLabelKey()`. */
export function groupMemberRoleChangedDraft(
  t: NotificationT,
  groupId: string,
  groupName: string,
  userId: string,
  role: string,
): NotificationDraft {
  return {
    id: `group-role-changed-${groupId}-${userId}-${role.toLowerCase()}`,
    type: 'group_invitation',
    ...texts(
      tr(t, 'nd.groupRoleChanged.title'),
      tr(t, 'nd.groupRoleChanged.body', {
        group: groupName,
        role: { key: `groupRole.${role.toLowerCase()}` },
      }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: groupId,
  };
}

/** Chính người nhận vừa bị xoá khỏi một nhóm (bởi người khác — tự rời nhóm
 *  không đi qua đây, xem markSelfOrigin ở group-store.ts). */
export function groupMemberRemovedDraft(
  t: NotificationT,
  groupId: string,
  groupName: string | null,
): NotificationDraft {
  return {
    id: `group-member-removed-${groupId}`,
    type: 'group_invitation',
    ...texts(
      tr(t, 'nd.groupMemberRemoved.title'),
      groupName
        ? tr(t, 'nd.groupMemberRemoved.body', { group: groupName })
        : tr(t, 'nd.groupMemberRemoved.bodyNoName'),
    ),
    createdAt: new Date().toISOString(),
  };
}

export interface GroupJoinRequestDraftInput {
  readonly requestId: string;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly requesterEmail?: string;
  readonly requesterName?: string;
  readonly createdAt: string;
}

/** Hiện cho LEADER/ADMIN khi có người gửi yêu cầu tham gia nhóm qua link mời. */
export function groupJoinRequestDraft(t: NotificationT, input: GroupJoinRequestDraftInput): NotificationDraft {
  const requester: string | NotifKeyRef =
    input.requesterName || input.requesterEmail || { key: 'nd.joinRequest.someone' };
  const group: string | NotifKeyRef = input.groupName ?? { key: 'nd.joinRequest.yourGroup' };
  const requesterText =
    input.requesterName || input.requesterEmail || t('nd.joinRequest.someone');
  return {
    id: `group-join-request-${input.requestId}`,
    type: 'group_join_request',
    ...texts(
      tr(t, 'nd.joinRequest.title'),
      tr(t, 'nd.joinRequest.body', { requester, group }),
    ),
    createdAt: input.createdAt,
    sender: input.requesterEmail ? { name: requesterText, email: input.requesterEmail } : undefined,
    relatedId: input.groupId,
    actionStatus: 'pending',
    metadata: { requestId: input.requestId, groupId: input.groupId },
  };
}

export interface GroupJoinRequestResolvedDraftInput {
  readonly requestId: string;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly status: 'approved' | 'declined';
  readonly createdAt: string;
}

/** Hiện cho người đã gửi yêu cầu, sau khi admin/leader duyệt hoặc từ chối. */
export function groupJoinRequestResolvedDraft(
  t: NotificationT,
  input: GroupJoinRequestResolvedDraftInput,
): NotificationDraft {
  const group = input.groupName ?? '';
  const approved = input.status === 'approved';
  return {
    id: `group-join-request-resolved-${input.requestId}`,
    type: 'group_join_request',
    ...texts(
      tr(t, approved ? 'nd.joinResolved.approvedTitle' : 'nd.joinResolved.declinedTitle'),
      tr(t, approved ? 'nd.joinResolved.approvedBody' : 'nd.joinResolved.declinedBody', { group }),
    ),
    createdAt: input.createdAt,
    relatedId: input.groupId,
    actionStatus: approved ? 'accepted' : 'declined',
    metadata: { requestId: input.requestId, groupId: input.groupId },
  };
}

export interface SystemNoticeDraftInput {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly level: 'info' | 'warning' | 'maintenance';
  readonly createdAt: string;
}

/** Nội dung do backend soạn sẵn (đã theo ngôn ngữ hệ thống) — không có key,
 *  giữ nguyên chuỗi backend gửi. */
export function systemNoticeDraft(input: SystemNoticeDraftInput): NotificationDraft {
  return {
    id: `system-${input.id}`,
    type: 'system',
    title: input.title,
    message: input.message,
    createdAt: input.createdAt,
    metadata: { level: input.level },
  };
}

export interface CalendarEventDraftInput {
  readonly eventId: string;
  readonly title: string;
  readonly timeLabel: string;
  readonly start: string;
  readonly end: string;
}

export function eventCreatedDraft(t: NotificationT, input: CalendarEventDraftInput): NotificationDraft {
  return {
    id: `event-created-${input.eventId}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.eventCreated.title'),
      tr(t, 'nd.eventCreated.body', { title: input.title, time: input.timeLabel }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export interface EventsImportedDraftInput {
  readonly batchId: string;
  readonly count: number;
  readonly calendarName?: string | null;
  /** Sự kiện SỚM NHẤT trong lô — bấm thông báo sẽ mở nó và nhảy lịch tới ngày đó. */
  readonly firstEventId?: string;
  /** ISO của sự kiện sớm nhất — để hiện ngày trong nội dung thông báo. */
  readonly firstEventStart?: string;
}

export function eventsImportedDraft(t: NotificationT, input: EventsImportedDraftInput): NotificationDraft {
  const hasDate = !!input.firstEventStart;
  const dateLabel = hasDate
    ? new Date(input.firstEventStart as string).toLocaleDateString(t('common.dateLocale'), {
        day: 'numeric',
        month: 'short',
      })
    : '';
  const key = input.calendarName
    ? hasDate
      ? 'nd.eventsImported.bodyToCalendarDated'
      : 'nd.eventsImported.bodyToCalendar'
    : hasDate
      ? 'nd.eventsImported.bodyDated'
      : 'nd.eventsImported.body';
  const params: NotifParams = {
    count: input.count,
    ...(input.calendarName ? { name: input.calendarName } : {}),
    ...(hasDate ? { date: dateLabel } : {}),
  };
  return {
    id: `events-imported-${input.batchId}`,
    type: 'event_update',
    ...texts(tr(t, 'nd.eventsImported.title'), tr(t, key, params)),
    createdAt: new Date().toISOString(),
    // Bấm thông báo → mở sự kiện sớm nhất + nhảy lịch tới ngày đó.
    relatedId: input.firstEventId,
    metadata: {
      count: String(input.count),
      ...(hasDate ? { date: input.firstEventStart as string } : {}),
    },
  };
}

export interface EventsBulkDraftInput {
  readonly calendarId: string;
  readonly eventIds: readonly string[];
  /** Lần lặp sớm nhất trong lô — bấm thông báo mở nó + nhảy lịch tới ngày đó. */
  readonly firstEventId?: string;
}

/** Sửa hàng loạt lần lặp của một chuỗi lặp lại (updateEventSeries scope
 *  'following'/'all') — không có batchId sẵn như lúc TẠO hàng loạt, nên ghép
 *  id ổn định từ chính nội dung lô (calendarId + danh sách id đã sắp xếp) để
 *  gói socket gửi lại (reconnect, retry) không tạo thông báo trùng. */
export function eventsBulkUpdatedDraft(t: NotificationT, input: EventsBulkDraftInput): NotificationDraft {
  const sortedIds = [...input.eventIds].sort();
  return {
    id: `events-bulk-updated-${shortHash(input.calendarId, ...sortedIds)}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.eventsBulkUpdated.title'),
      tr(t, 'nd.eventsBulkUpdated.body', { count: input.eventIds.length }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: input.firstEventId,
  };
}

export function eventsBulkDeletedDraft(t: NotificationT, input: EventsBulkDraftInput): NotificationDraft {
  const sortedIds = [...input.eventIds].sort();
  return {
    id: `events-bulk-deleted-${shortHash(input.calendarId, ...sortedIds)}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.eventsBulkDeleted.title'),
      tr(t, 'nd.eventsBulkDeleted.body', { count: input.eventIds.length }),
    ),
    createdAt: new Date().toISOString(),
  };
}

export function eventUpdatedDraft(t: NotificationT, input: CalendarEventDraftInput): NotificationDraft {
  return {
    id: `event-updated-${input.eventId}-${shortHash(input.start, input.end, input.title)}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.eventUpdated.title'),
      tr(t, 'nd.eventUpdated.body', { title: input.title, time: input.timeLabel }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export interface ConflictingEvent {
  readonly id: string;
  readonly title: string;
}

export interface EventConflictDraftInput {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly conflicts: readonly ConflictingEvent[];
}

export function eventConflictDraft(t: NotificationT, input: EventConflictDraftInput): NotificationDraft {
  const [first, ...rest] = input.conflicts;
  const withWhom: NotifKeyRef =
    rest.length > 0
      ? { key: 'nd.eventConflict.withOthers', params: { first: first.title, count: rest.length } }
      : { key: 'nd.eventConflict.withOne', params: { first: first.title } };
  return {
    id: `event-conflict-${input.eventId}-${shortHash([...input.conflicts].map((c) => c.id).sort().join(','))}`,
    type: 'conflict',
    ...texts(
      tr(t, 'nd.eventConflict.title'),
      tr(t, 'nd.eventConflict.body', { title: input.eventTitle, with: withWhom }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export function eventDeletedDraft(t: NotificationT, eventId: string, title: string | null): NotificationDraft {
  return {
    id: `event-deleted-${eventId}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.eventDeleted.title'),
      title ? tr(t, 'nd.eventDeleted.body', { title }) : tr(t, 'nd.eventDeleted.bodyNoTitle'),
    ),
    createdAt: new Date().toISOString(),
    relatedId: eventId,
  };
}

export interface AttendeeStatusDraftInput {
  readonly eventId: string;
  readonly attendeeId: string;
  readonly attendeeEmail: string;
  readonly eventTitle: string | null;
  readonly status: 'accepted' | 'declined';
}

export function attendeeStatusDraft(t: NotificationT, input: AttendeeStatusDraftInput): NotificationDraft {
  const verb: NotifKeyRef = {
    key: input.status === 'accepted' ? 'nd.attendeeStatus.accepted' : 'nd.attendeeStatus.declined',
  };
  const event: NotifKeyRef = input.eventTitle
    ? { key: 'nd.attendeeStatus.eventPart', params: { title: input.eventTitle } }
    : { key: 'nd.attendeeStatus.yourEvent' };
  return {
    id: `attendee-status-${input.eventId}-${input.attendeeId}-${input.status}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.attendeeStatus.title'),
      tr(t, 'nd.attendeeStatus.body', { email: input.attendeeEmail, verb, event }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export function eventInvitationDraft(
  t: NotificationT,
  eventId: string,
  eventTitle: string | null,
): NotificationDraft {
  return {
    id: `event-invite-${eventId}`,
    type: 'event_invitation',
    ...texts(
      tr(t, 'nd.eventInvite.title'),
      eventTitle
        ? tr(t, 'nd.eventInvite.body', { title: eventTitle })
        : tr(t, 'nd.eventInvite.bodyNoTitle'),
    ),
    createdAt: new Date().toISOString(),
    relatedId: eventId,
    actionStatus: 'pending',
  };
}

export interface CalendarInviteDraftInput {
  readonly inviteId: string;
  readonly calendarId: string;
  readonly calendarName: string;
  readonly inviterEmail: string | null;
  readonly createdAt: string;
}

export function calendarInvitationDraft(t: NotificationT, input: CalendarInviteDraftInput): NotificationDraft {
  return {
    id: `calendar-invite-${input.inviteId}`,
    type: 'event_invitation',
    ...texts(
      tr(t, 'nd.calendarInvite.title'),
      input.inviterEmail
        ? tr(t, 'nd.calendarInvite.bodyFrom', { email: input.inviterEmail, name: input.calendarName })
        : tr(t, 'nd.calendarInvite.body', { name: input.calendarName }),
    ),
    createdAt: input.createdAt,
    sender: input.inviterEmail ? { name: input.inviterEmail, email: input.inviterEmail } : undefined,
    relatedId: input.calendarId,
    actionStatus: 'pending',
    metadata: { inviteId: input.inviteId },
  };
}

export function calendarMemberJoinedDraft(
  t: NotificationT,
  calendarId: string,
  calendarName: string,
  memberUserId: string,
): NotificationDraft {
  return {
    id: `calendar-member-${calendarId}-${memberUserId}`,
    type: 'group_invitation',
    ...texts(
      tr(t, 'nd.calendarMemberJoined.title'),
      tr(t, 'nd.calendarMemberJoined.body', { name: calendarName }),
    ),
    createdAt: new Date().toISOString(),
    relatedId: calendarId,
  };
}

/** Chủ lịch xoá một lịch mà mình chỉ là thành viên (được mời) — sự kiện của
 *  lịch đó biến mất khỏi máy mình ngay, cần báo rõ vì sao thay vì im lặng. */
export function calendarDeletedDraft(
  t: NotificationT,
  calendarId: string,
  calendarName: string | null,
): NotificationDraft {
  return {
    id: `calendar-deleted-${calendarId}`,
    type: 'event_update',
    ...texts(
      tr(t, 'nd.calendarDeleted.title'),
      calendarName
        ? tr(t, 'nd.calendarDeleted.body', { name: calendarName })
        : tr(t, 'nd.calendarDeleted.bodyNoName'),
    ),
    createdAt: new Date().toISOString(),
  };
}

export interface ReminderDraftInput {
  readonly reminderId: string;
  readonly eventId: string;
  readonly title: string;
  readonly startAt: string;
  readonly meetLink?: string | null;
  readonly groupId?: string;
}

export function reminderDraft(t: NotificationT, input: ReminderDraftInput): NotificationDraft {
  const startMs = input.startAt ? new Date(input.startAt).getTime() : 0;
  const nowMs = Date.now();
  const diffMin = startMs ? Math.round((startMs - nowMs) / 60000) : 0;

  let titleText: Text = tr(t, 'nd.reminder.title');
  let bodyText: Text = tr(t, 'nd.reminder.body', { title: input.title });

  if (input.meetLink) {
    if (diffMin <= 1) {
      titleText = raw('Phòng họp đã sẵn sàng');
      bodyText = raw(`Cuộc họp "${input.title}" đã bắt đầu.`);
    } else {
      titleText = raw(`Sắp tới giờ họp (${diffMin} phút nữa)`);
      bodyText = raw(`Cuộc họp "${input.title}" chuẩn bị bắt đầu.`);
    }
  }

  return {
    id: `reminder-${input.reminderId}`,
    type: 'reminder',
    ...texts(titleText, bodyText),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
    metadata: {
      startAt: input.startAt,
      ...(input.groupId ? { groupId: input.groupId } : {}),
      ...(input.meetLink ? { meetLink: input.meetLink } : {}),
    },
  };
}
