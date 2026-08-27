import { NotificationDraft } from './notification.model';

/**
 * Lớp ADAPTER giữa dữ liệu domain (event, task, tin nhắn...) và Notification
 * Center. Toàn bộ là hàm thuần; store nào nhận được sự kiện realtime thì gọi
 * hàm ở đây rồi đẩy sang `NotificationService.ingest()`.
 *
 * Mỗi hàm nhận `t` (hàm dịch của `TranslationService`) để tiêu đề/nội dung
 * hiển thị theo đúng ngôn ngữ đang chọn tại thời điểm thông báo được tạo. Chuỗi
 * được "đóng băng" vào thông báo lúc tạo — đổi ngôn ngữ sau đó không dịch lại
 * các thông báo cũ (đánh đổi có chủ đích để không phải đổi mô hình lưu trữ).
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
    title: input.senderName,
    message: t('nd.message.body', { group: input.groupName }),
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
    title: t('nd.mention.title', { sender: input.senderName }),
    message: t('nd.mention.body', { group: input.groupName }),
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
    title: t('nd.taskAssigned.title'),
    message: t('nd.taskAssigned.body', { title: input.title, group: input.groupName }),
    createdAt: input.createdAt,
    relatedId: input.taskId,
    metadata: { groupId: input.groupId, taskTitle: input.title },
  };
}

export function groupTaskUpdatedDraft(t: NotificationT, input: GroupTaskDraftInput): NotificationDraft {
  return {
    id: `task-updated-${input.taskId}-${shortHash(input.status, input.assignedTo ?? '')}`,
    type: 'task',
    title: t('nd.taskUpdated.title'),
    message: t('nd.taskUpdated.body', {
      title: input.title,
      status: t(TASK_STATUS_KEY[input.status]),
    }),
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
    title: t('nd.taskDeleted.title'),
    message: t('nd.taskDeleted.body', { title }),
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
  const verb = t(keys.verb);
  return {
    id: `deadline-${input.taskId}-${input.phase}`,
    type: 'deadline',
    title: t(keys.title),
    message: input.groupName
      ? t('nd.deadline.bodyInGroup', { title: input.title, group: input.groupName, verb })
      : t('nd.deadline.body', { title: input.title, verb }),
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
    title: t('nd.groupInvite.title'),
    message: input.inviterEmail
      ? t('nd.groupInvite.bodyFrom', { email: input.inviterEmail, group: input.groupName })
      : t('nd.groupInvite.body', { group: input.groupName }),
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
    title: t('nd.groupRoleChanged.title'),
    message: t('nd.groupRoleChanged.body', {
      group: groupName,
      role: t(`groupRole.${role.toLowerCase()}`),
    }),
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
    title: t('nd.groupMemberRemoved.title'),
    message: groupName
      ? t('nd.groupMemberRemoved.body', { group: groupName })
      : t('nd.groupMemberRemoved.bodyNoName'),
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
  const requester = input.requesterName || input.requesterEmail || t('nd.joinRequest.someone');
  return {
    id: `group-join-request-${input.requestId}`,
    type: 'group_join_request',
    title: t('nd.joinRequest.title'),
    message: t('nd.joinRequest.body', {
      requester,
      group: input.groupName ?? t('nd.joinRequest.yourGroup'),
    }),
    createdAt: input.createdAt,
    sender: input.requesterEmail ? { name: requester, email: input.requesterEmail } : undefined,
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
  return {
    id: `group-join-request-resolved-${input.requestId}`,
    type: 'group_join_request',
    title: input.status === 'approved' ? t('nd.joinResolved.approvedTitle') : t('nd.joinResolved.declinedTitle'),
    message:
      input.status === 'approved'
        ? t('nd.joinResolved.approvedBody', { group })
        : t('nd.joinResolved.declinedBody', { group }),
    createdAt: input.createdAt,
    relatedId: input.groupId,
    actionStatus: input.status === 'approved' ? 'accepted' : 'declined',
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

/** Nội dung do backend soạn sẵn (đã theo ngôn ngữ hệ thống) — không dịch lại. */
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
    title: t('nd.eventCreated.title'),
    message: t('nd.eventCreated.body', { title: input.title, time: input.timeLabel }).trim(),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export interface EventsImportedDraftInput {
  readonly batchId: string;
  readonly count: number;
  readonly calendarName?: string | null;
}

export function eventsImportedDraft(t: NotificationT, input: EventsImportedDraftInput): NotificationDraft {
  return {
    id: `events-imported-${input.batchId}`,
    type: 'event_update',
    title: t('nd.eventsImported.title'),
    message: input.calendarName
      ? t('nd.eventsImported.bodyToCalendar', { count: input.count, name: input.calendarName })
      : t('nd.eventsImported.body', { count: input.count }),
    createdAt: new Date().toISOString(),
    metadata: { count: String(input.count) },
  };
}

export interface EventsBulkDraftInput {
  readonly calendarId: string;
  readonly eventIds: readonly string[];
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
    title: t('nd.eventsBulkUpdated.title'),
    message: t('nd.eventsBulkUpdated.body', { count: input.eventIds.length }),
    createdAt: new Date().toISOString(),
  };
}

export function eventsBulkDeletedDraft(t: NotificationT, input: EventsBulkDraftInput): NotificationDraft {
  const sortedIds = [...input.eventIds].sort();
  return {
    id: `events-bulk-deleted-${shortHash(input.calendarId, ...sortedIds)}`,
    type: 'event_update',
    title: t('nd.eventsBulkDeleted.title'),
    message: t('nd.eventsBulkDeleted.body', { count: input.eventIds.length }),
    createdAt: new Date().toISOString(),
  };
}

export function eventUpdatedDraft(t: NotificationT, input: CalendarEventDraftInput): NotificationDraft {
  return {
    id: `event-updated-${input.eventId}-${shortHash(input.start, input.end, input.title)}`,
    type: 'event_update',
    title: t('nd.eventUpdated.title'),
    message: t('nd.eventUpdated.body', { title: input.title, time: input.timeLabel }).trim(),
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
  const withWhom =
    rest.length > 0
      ? t('nd.eventConflict.withOthers', { first: first.title, count: rest.length })
      : t('nd.eventConflict.withOne', { first: first.title });
  return {
    id: `event-conflict-${input.eventId}-${shortHash([...input.conflicts].map((c) => c.id).sort().join(','))}`,
    type: 'conflict',
    title: t('nd.eventConflict.title'),
    message: t('nd.eventConflict.body', { title: input.eventTitle, with: withWhom }),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export function eventDeletedDraft(t: NotificationT, eventId: string, title: string | null): NotificationDraft {
  return {
    id: `event-deleted-${eventId}`,
    type: 'event_update',
    title: t('nd.eventDeleted.title'),
    message: title ? t('nd.eventDeleted.body', { title }) : t('nd.eventDeleted.bodyNoTitle'),
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
  const verb = input.status === 'accepted' ? t('nd.attendeeStatus.accepted') : t('nd.attendeeStatus.declined');
  const eventPart = input.eventTitle
    ? t('nd.attendeeStatus.eventPart', { title: input.eventTitle })
    : t('nd.attendeeStatus.yourEvent');
  return {
    id: `attendee-status-${input.eventId}-${input.attendeeId}-${input.status}`,
    type: 'event_update',
    title: t('nd.attendeeStatus.title'),
    message: t('nd.attendeeStatus.body', { email: input.attendeeEmail, verb, event: eventPart }),
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
    title: t('nd.eventInvite.title'),
    message: eventTitle
      ? t('nd.eventInvite.body', { title: eventTitle })
      : t('nd.eventInvite.bodyNoTitle'),
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
    title: t('nd.calendarInvite.title'),
    message: input.inviterEmail
      ? t('nd.calendarInvite.bodyFrom', { email: input.inviterEmail, name: input.calendarName })
      : t('nd.calendarInvite.body', { name: input.calendarName }),
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
    title: t('nd.calendarMemberJoined.title'),
    message: t('nd.calendarMemberJoined.body', { name: calendarName }),
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
    title: t('nd.calendarDeleted.title'),
    message: calendarName
      ? t('nd.calendarDeleted.body', { name: calendarName })
      : t('nd.calendarDeleted.bodyNoName'),
    createdAt: new Date().toISOString(),
  };
}

export interface ReminderDraftInput {
  readonly reminderId: string;
  readonly eventId: string;
  readonly title: string;
  readonly startAt: string;
}

export function reminderDraft(t: NotificationT, input: ReminderDraftInput): NotificationDraft {
  return {
    id: `reminder-${input.reminderId}`,
    type: 'reminder',
    title: t('nd.reminder.title'),
    message: t('nd.reminder.body', { title: input.title }),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
    metadata: { startAt: input.startAt },
  };
}
