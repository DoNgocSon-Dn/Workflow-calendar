import { describe, expect, it } from 'vitest';
import { createMeetingRoomLink, createMeetingRoomName } from './meeting-link.util';

describe('createMeetingRoomName', () => {
  it('chia ba cụm bốn ký tự', () => {
    expect(createMeetingRoomName()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  it('không chứa ký tự dễ đọc nhầm (0, o, 1, l)', () => {
    const sample = Array.from({ length: 200 }, () => createMeetingRoomName()).join('');
    expect(sample).not.toMatch(/[01ol]/);
  });

  it('không lặp lại giữa các lần gọi', () => {
    const names = new Set(Array.from({ length: 500 }, () => createMeetingRoomName()));
    expect(names.size).toBe(500);
  });
});

describe('createMeetingRoomLink', () => {
  it('dựng URL tuyệt đối mở được ngay', () => {
    const link = createMeetingRoomLink();
    expect(link).toMatch(/^https:\/\/meet\.jit\.si\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(() => new URL(link)).not.toThrow();
  });

  it('không bịa ra link meet.google.com — mã phòng Meet phải do Google cấp', () => {
    expect(createMeetingRoomLink()).not.toContain('meet.google.com');
  });
});
