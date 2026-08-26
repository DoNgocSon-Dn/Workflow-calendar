import { NotificationDraft } from './notification.model';

/**
 * Lớp ADAPTER giữa dữ liệu domain (event, task, tin nhắn...) và Notification
 * Center. Toàn bộ là hàm thuần, không DI, không đụng socket — store nào nhận
 * được sự kiện realtime thì gọi hàm ở đây rồi đẩy sang
 * `NotificationService.ingest()`.
 *
 * Mỗi hàm phải sinh ra `id` ỔN ĐỊNH từ chính dữ liệu nguồn: cùng một sự kiện
 * đến lại (socket gửi trùng, reconnect phát lại) sẽ cho ra cùng `id` và bị
 * `ingest()` loại bỏ, nên không bao giờ có thông báo trùng.
 */

const PREVIEW_LIMIT = 80;

/** Rút gọn nội dung dài để dòng preview không phá vỡ bố cục item. */
function preview(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…` : text;
}

/** Hash ngắn (djb2) để nhét phần "nội dung đã đổi" vào id mà id không dài ra:
 *  sửa sự kiện lần nữa sẽ ra hash khác → tạo thông báo mới, còn cùng một payload
 *  đến hai lần thì hash trùng → bị dedupe. */
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

export function groupMessageDraft(input: GroupMessageDraftInput): NotificationDraft {
  return {
    id: `message-${input.messageId}`,
    type: 'message',
    title: input.senderName,
    message: `Đã gửi một tin nhắn trong nhóm "${input.groupName}".`,
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
export function groupMentionDraft(input: GroupMessageDraftInput): NotificationDraft {
  return {
    id: `mention-${input.messageId}`,
    type: 'mention',
    title: `${input.senderName} đã nhắc đến bạn`,
    message: `đã nhắc đến bạn trong nhóm "${input.groupName}".`,
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

const TASK_STATUS_LABEL: Readonly<Record<GroupTaskDraftInput['status'], string>> = {
  todo: 'Cần làm',
  in_progress: 'Đang thực hiện',
  done: 'Hoàn thành',
};

export function groupTaskAssignedDraft(input: GroupTaskDraftInput): NotificationDraft {
  return {
    id: `task-assigned-${input.taskId}`,
    type: 'task',
    title: 'Nhiệm vụ mới',
    message: `Bạn được giao nhiệm vụ "${input.title}" trong nhóm "${input.groupName}".`,
    createdAt: input.createdAt,
    relatedId: input.taskId,
    metadata: { groupId: input.groupId, taskTitle: input.title },
  };
}

export function groupTaskUpdatedDraft(input: GroupTaskDraftInput): NotificationDraft {
  return {
    // Trạng thái nằm trong id: mỗi lần đổi trạng thái là một thông báo mới,
    // nhưng cùng một lần đổi phát lại thì bị loại.
    id: `task-updated-${input.taskId}-${shortHash(input.status, input.assignedTo ?? '')}`,
    type: 'task',
    title: 'Công việc được cập nhật',
    message: `"${input.title}" đã chuyển sang ${TASK_STATUS_LABEL[input.status]}.`,
    createdAt: input.createdAt,
    relatedId: input.taskId,
    metadata: { groupId: input.groupId, status: input.status },
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
  /** Timestamp của backend khi có; thiếu thì mới lấy giờ client. */
  readonly createdAt?: string;
}

const DEADLINE_TEXT: Readonly<Record<DeadlinePhase, { title: string; verb: string }>> = {
  upcoming: { title: 'Sắp đến hạn', verb: 'sắp đến hạn' },
  due: { title: 'Đến hạn hôm nay', verb: 'đã đến hạn' },
  overdue: { title: 'Đã quá hạn', verb: 'đã quá hạn' },
};

export function taskDeadlineDraft(input: TaskDeadlineDraftInput): NotificationDraft {
  const text = DEADLINE_TEXT[input.phase];
  const where = input.groupName ? ` trong nhóm "${input.groupName}"` : '';
  return {
    // Mỗi mốc là một thông báo riêng cho cùng task; cron chạy lại hay socket
    // phát lại đều ra cùng id nên không sinh bản trùng.
    id: `deadline-${input.taskId}-${input.phase}`,
    type: 'deadline',
    title: text.title,
    message: `Công việc "${input.title}"${where} ${text.verb}.`,
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

export function groupInvitationDraft(input: GroupInvitationDraftInput): NotificationDraft {
  return {
    id: `group-invitation-${input.inviteId}`,
    type: 'group_invitation',
    title: 'Lời mời tham gia nhóm',
    message: input.inviterEmail
      ? `${input.inviterEmail} mời bạn tham gia nhóm "${input.groupName}".`
      : `Bạn nhận được lời mời tham gia nhóm "${input.groupName}".`,
    createdAt: input.createdAt,
    sender: input.inviterEmail ? { name: input.inviterEmail, email: input.inviterEmail } : undefined,
    relatedId: input.groupId,
    actionStatus: input.status,
    metadata: { inviteId: input.inviteId, role: input.role },
  };
}

export interface SystemNoticeDraftInput {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly level: 'info' | 'warning' | 'maintenance';
  readonly createdAt: string;
}

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

export function eventCreatedDraft(input: CalendarEventDraftInput): NotificationDraft {
  return {
    id: `event-created-${input.eventId}`,
    type: 'event_update',
    title: 'Sự kiện mới',
    message: `"${input.title}" đã được thêm vào lịch. ${input.timeLabel}`.trim(),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export function eventUpdatedDraft(input: CalendarEventDraftInput): NotificationDraft {
  return {
    // Giờ bắt đầu/kết thúc nằm trong id: dời lịch lần nữa sẽ báo tiếp, còn cùng
    // một lần dời phát lại thì không.
    id: `event-updated-${input.eventId}-${shortHash(input.start, input.end, input.title)}`,
    type: 'event_update',
    title: 'Sự kiện đã thay đổi',
    message: `"${input.title}" vừa được cập nhật. ${input.timeLabel}`.trim(),
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export function eventDeletedDraft(eventId: string, title: string | null): NotificationDraft {
  return {
    id: `event-deleted-${eventId}`,
    type: 'event_update',
    title: 'Sự kiện đã bị hủy',
    message: title ? `"${title}" đã bị xóa khỏi lịch.` : 'Một sự kiện đã bị xóa khỏi lịch.',
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

export function attendeeStatusDraft(input: AttendeeStatusDraftInput): NotificationDraft {
  const label = input.status === 'accepted' ? 'đã đồng ý tham gia' : 'đã từ chối tham gia';
  const eventPart = input.eventTitle ? ` sự kiện "${input.eventTitle}"` : ' sự kiện của bạn';
  return {
    // Cùng người, cùng trạng thái phát lại thì bị loại; đổi ý (accepted <->
    // declined) lại là id khác nên vẫn báo tiếp.
    id: `attendee-status-${input.eventId}-${input.attendeeId}-${input.status}`,
    type: 'event_update',
    title: 'Phản hồi lời mời',
    message: `${input.attendeeEmail} ${label}${eventPart}.`,
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
  };
}

export function eventInvitationDraft(eventId: string, eventTitle: string | null): NotificationDraft {
  return {
    id: `event-invite-${eventId}`,
    type: 'event_invitation',
    title: 'Lời mời tham gia sự kiện',
    message: eventTitle
      ? `Bạn được mời tham gia sự kiện "${eventTitle}".`
      : 'Bạn được mời tham gia một sự kiện.',
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

export function calendarInvitationDraft(input: CalendarInviteDraftInput): NotificationDraft {
  return {
    id: `calendar-invite-${input.inviteId}`,
    type: 'event_invitation',
    title: 'Lời mời tham gia lịch',
    message: input.inviterEmail
      ? `${input.inviterEmail} mời bạn tham gia lịch "${input.calendarName}".`
      : `Bạn được mời tham gia lịch "${input.calendarName}".`,
    createdAt: input.createdAt,
    sender: input.inviterEmail ? { name: input.inviterEmail, email: input.inviterEmail } : undefined,
    relatedId: input.calendarId,
    actionStatus: 'pending',
    metadata: { inviteId: input.inviteId },
  };
}

export function calendarMemberJoinedDraft(
  calendarId: string,
  calendarName: string,
  memberUserId: string,
): NotificationDraft {
  return {
    id: `calendar-member-${calendarId}-${memberUserId}`,
    type: 'group_invitation',
    title: 'Thành viên mới',
    message: `Một người vừa tham gia lịch "${calendarName}".`,
    createdAt: new Date().toISOString(),
    relatedId: calendarId,
  };
}

export interface ReminderDraftInput {
  readonly reminderId: string;
  readonly eventId: string;
  readonly title: string;
  readonly startAt: string;
}

export function reminderDraft(input: ReminderDraftInput): NotificationDraft {
  return {
    id: `reminder-${input.reminderId}`,
    type: 'reminder',
    title: 'Sắp diễn ra',
    message: `Sự kiện "${input.title}" sắp bắt đầu.`,
    createdAt: new Date().toISOString(),
    relatedId: input.eventId,
    metadata: { startAt: input.startAt },
  };
}
