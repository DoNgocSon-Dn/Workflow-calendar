import { describe, expect, it } from 'vitest';
import {
  groupTaskUpdatedDraft,
  taskDeadlineDraft,
  eventDeletedDraft,
  NotificationT,
} from './notification-drafts';
import { resolveNotifText } from './notification.model';

/**
 * Thông báo phải DỊCH LẠI theo ngôn ngữ hiện tại, kể cả cái nhận từ trước:
 * draft lưu `titleKey`/`messageKey` + params, `notification-item` gọi
 * `resolveNotifText` mỗi lần render. Params lồng nhau (trạng thái task, động
 * từ deadline) cũng phải đổi theo.
 */

const VI: Record<string, string> = {
  'nd.taskUpdated.title': 'Công việc cập nhật',
  'nd.taskUpdated.body': '"{title}" chuyển sang {status}',
  'nd.taskStatus.done': 'hoàn thành',
  'nd.eventDeleted.title': 'Sự kiện đã xoá',
  'nd.eventDeleted.body': 'Đã xoá "{title}"',
  'nd.deadline.dueTitle': 'Đến hạn',
  'nd.deadline.dueVerb': 'đến hạn hôm nay',
  'nd.deadline.body': '"{title}" {verb}',
};

const EN: Record<string, string> = {
  'nd.taskUpdated.title': 'Task updated',
  'nd.taskUpdated.body': '"{title}" moved to {status}',
  'nd.taskStatus.done': 'done',
  'nd.eventDeleted.title': 'Event deleted',
  'nd.eventDeleted.body': 'Deleted "{title}"',
  'nd.deadline.dueTitle': 'Due',
  'nd.deadline.dueVerb': 'is due today',
  'nd.deadline.body': '"{title}" {verb}',
};

function makeT(table: Record<string, string>): NotificationT {
  return (key, vars) => {
    let text = table[key] ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{${k}}`, String(v));
    return text.trim();
  };
}

const render = (draft: ReturnType<typeof eventDeletedDraft>, table: Record<string, string>) => ({
  title: resolveNotifText(draft.title, draft.titleKey, draft.titleParams, makeT(table)),
  message: resolveNotifText(draft.message, draft.messageKey, draft.messageParams, makeT(table)),
});

describe('notification re-translation', () => {
  it('re-renders a simple draft in whichever language is active now', () => {
    const draft = eventDeletedDraft(makeT(VI), 'e1', 'Họp nhóm');
    expect(draft.message).toBe('Đã xoá "Họp nhóm"'); // baked at creation

    expect(render(draft, EN)).toEqual({ title: 'Event deleted', message: 'Deleted "Họp nhóm"' });
    expect(render(draft, VI)).toEqual({ title: 'Sự kiện đã xoá', message: 'Đã xoá "Họp nhóm"' });
  });

  it('re-translates a nested param (task status) too', () => {
    const draft = groupTaskUpdatedDraft(makeT(VI), {
      taskId: 't1',
      groupId: 'g1',
      groupName: 'Team',
      title: 'Fix bug',
      status: 'done',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(render(draft, EN).message).toBe('"Fix bug" moved to done');
    expect(render(draft, VI).message).toBe('"Fix bug" chuyển sang hoàn thành');
  });

  it('re-translates the deadline verb param', () => {
    const draft = taskDeadlineDraft(makeT(VI), {
      taskId: 't1',
      groupId: 'g1',
      groupName: null,
      title: 'Report',
      dueDate: '2026-01-02',
      phase: 'due',
    });
    expect(render(draft, EN).message).toBe('"Report" is due today');
    expect(render(draft, VI).message).toBe('"Report" đến hạn hôm nay');
  });

  it('falls back to the baked string when there is no key (backend system notice)', () => {
    expect(resolveNotifText('Bảo trì hệ thống', undefined, undefined, makeT(EN))).toBe(
      'Bảo trì hệ thống',
    );
  });
});
