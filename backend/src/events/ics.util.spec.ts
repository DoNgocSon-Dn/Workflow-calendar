import { attendeeIcsUid, buildEventIcs } from './ics.util';

describe('buildEventIcs', () => {
  const base = {
    uid: 'event-attendee-att-1@workflow',
    sequence: 0,
    organizerEmail: 'workflow@test.com',
    organizerName: 'Workflow',
    attendeeEmail: 'khach@gmail.com',
    title: 'Họp nhóm',
    startAt: '2026-09-01T09:00:00.000Z',
    endAt: '2026-09-01T10:30:00.000Z',
  } as const;

  it('sinh VCALENDAR REQUEST với thời gian UTC dạng YYYYMMDDTHHMMSSZ', () => {
    const ics = buildEventIcs({ ...base, method: 'REQUEST', status: 'CONFIRMED' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('DTSTART:20260901T090000Z');
    expect(ics).toContain('DTEND:20260901T103000Z');
    expect(ics).toContain('UID:event-attendee-att-1@workflow');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('ORGANIZER;CN=Workflow:mailto:workflow@test.com');
    expect(ics).toContain('mailto:khach@gmail.com');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('CANCEL đặt METHOD và STATUS phù hợp, giữ nguyên UID + SEQUENCE tăng', () => {
    const ics = buildEventIcs({
      ...base,
      method: 'CANCEL',
      status: 'CANCELLED',
      sequence: 3,
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:3');
    expect(ics).toContain('UID:event-attendee-att-1@workflow');
  });

  it('escape ký tự đặc biệt RFC 5545 trong SUMMARY / DESCRIPTION', () => {
    const ics = buildEventIcs({
      ...base,
      method: 'REQUEST',
      status: 'CONFIRMED',
      title: 'A; B, C\\D',
      description: 'dòng 1\ndòng 2',
    });
    expect(ics).toContain('SUMMARY:A\\; B\\, C\\\\D');
    expect(ics).toContain('DESCRIPTION:dòng 1\\ndòng 2');
  });

  it('ném lỗi khi mốc thời gian không hợp lệ', () => {
    expect(() =>
      buildEventIcs({ ...base, method: 'REQUEST', status: 'CONFIRMED', startAt: 'không-phải-ngày' }),
    ).toThrow();
  });

  it('attendeeIcsUid ổn định theo attendeeId', () => {
    expect(attendeeIcsUid('abc')).toBe('event-attendee-abc@workflow');
  });
});
