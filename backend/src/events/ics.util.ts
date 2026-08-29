/**
 * Sinh nội dung iCalendar (RFC 5545) cho lời mời sự kiện gửi qua email.
 *
 * Dùng cho luồng iMIP: email đính kèm phần `text/calendar; method=REQUEST`
 * (hoặc `CANCEL`) để Gmail/Outlook/Apple Calendar tự thêm/gỡ sự kiện khỏi
 * lịch người nhận — kể cả người chưa có tài khoản Workflow.
 */

export type IcsMethod = 'REQUEST' | 'CANCEL';
export type IcsStatus = 'CONFIRMED' | 'CANCELLED';

export interface BuildEventIcsInput {
  method: IcsMethod;
  /** ID ổn định suốt vòng đời lời mời — KHÔNG đổi khi sửa/huỷ sự kiện. */
  uid: string;
  /** Tăng dần mỗi lần gửi lại (REQUEST cập nhật / CANCEL). */
  sequence: number;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO 8601 (có offset) — thường là timestamptz từ Postgres. */
  startAt: string;
  endAt: string;
  status: IcsStatus;
  /** Trạng thái phản hồi của khách. Mặc định 'NEEDS-ACTION' (lời mời).
   *  Dùng 'ACCEPTED' cho email chốt lịch sau khi khách đồng ý. */
  partstat?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED';
}

/** `2026-09-01T09:30:00.000Z` -> `20260901T093000Z` (luôn quy về UTC). */
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`ICS: mốc thời gian không hợp lệ: ${iso}`);
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escape ký tự đặc biệt trong giá trị TEXT theo RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Gấp dòng ở mốc 75 octet, dòng nối bắt đầu bằng 1 khoảng trắng (§3.1). */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    // Dòng đầu tối đa 75, các dòng sau có 1 space dẫn đầu nên còn 74.
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > limit) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}

export function buildEventIcs(input: BuildEventIcsInput): string {
  const organizerCn = input.organizerName ?? input.organizerEmail;
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Workflow//Calendar//VI',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.method}`,
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(input.startAt)}`,
    `DTEND:${toIcsUtc(input.endAt)}`,
    `SUMMARY:${escapeText(input.title)}`,
    input.description
      ? `DESCRIPTION:${escapeText(input.description)}`
      : null,
    input.location ? `LOCATION:${escapeText(input.location)}` : null,
    `ORGANIZER;CN=${escapeText(organizerCn)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(input.attendeeEmail)};ROLE=REQ-PARTICIPANT;` +
      `PARTSTAT=${input.partstat ?? 'NEEDS-ACTION'};RSVP=TRUE:mailto:${input.attendeeEmail}`,
    `STATUS:${input.status}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** UID ổn định cho một dòng khách mời (một attendee của một sự kiện). */
export function attendeeIcsUid(attendeeId: string): string {
  return `event-attendee-${attendeeId}@workflow`;
}
