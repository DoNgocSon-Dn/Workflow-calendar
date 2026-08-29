/**
 * Tiện ích múi giờ — không dùng thư viện ngoài, chỉ `Intl`.
 *
 * Sự kiện luôn lưu dưới dạng mốc UTC (`Date`). `startTz` (tên IANA) chỉ nói
 * sự kiện "thuộc về" múi giờ nào để hiển thị lại đúng giờ gốc cho người xem ở
 * nơi khác. Vắng `startTz` ⇒ mọi thứ theo múi giờ trình duyệt, y như cũ.
 */

/** Múi giờ của trình duyệt hiện tại (vd 'Asia/Ho_Chi_Minh'). */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Offset (mili giây) mà `timeZone` đi trước UTC tại đúng thời điểm `instant`. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(instant)) {
    if (type !== 'literal') map[type] = Number(value);
  }
  const asUtc = Date.UTC(map['year'], map['month'] - 1, map['day'], map['hour'], map['minute'], map['second']);
  // formatToParts không có mili giây — so ở mốc giây cho khớp.
  const instantSec = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - instantSec;
}

/**
 * Giờ treo tường (đọc trên đồng hồ đặt tại `timeZone`) → mốc UTC tuyệt đối.
 * `month` tính từ 1. Có bù DST bằng một vòng lặp hiệu chỉnh.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMs(new Date(guess), timeZone);
  const off2 = tzOffsetMs(new Date(guess - off1), timeZone);
  return new Date(guess - off2);
}

/** Mốc UTC → giờ treo tường tại `timeZone`. `mon` tính từ 1. */
export function utcToZonedWall(
  instant: Date,
  timeZone: string,
): { year: number; mon: number; day: number; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(instant)) {
    if (type !== 'literal') map[type] = Number(value);
  }
  return { year: map['year'], mon: map['month'], day: map['day'], hour: map['hour'], minute: map['minute'] };
}

/** True nếu hai tên múi giờ cho cùng một offset tại `instant` (coi như tương đương để hiển thị). */
export function sameOffset(tzA: string, tzB: string, instant: Date): boolean {
  if (tzA === tzB) return true;
  try {
    return tzOffsetMs(instant, tzA) === tzOffsetMs(instant, tzB);
  } catch {
    return false;
  }
}

/** 'GMT+7', 'GMT-4:30' cho `timeZone` tại `instant`. */
export function formatTzOffset(timeZone: string, instant: Date): string {
  let mins = 0;
  try {
    mins = Math.round(tzOffsetMs(instant, timeZone) / 60000);
  } catch {
    return timeZone;
  }
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/** Nhãn ngắn gọn cho picker: "Asia/Ho_Chi_Minh (GMT+7)". */
export function tzPickerLabel(timeZone: string, instant: Date): string {
  return `${timeZone.replace(/_/g, ' ')} (${formatTzOffset(timeZone, instant)})`;
}

const FALLBACK_TIME_ZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

/** Danh sách múi giờ cho `<select>`. Ưu tiên đầy đủ từ `Intl.supportedValuesOf`. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.('timeZone');
    if (all && all.length > 0) return all;
  } catch {
    /* rơi xuống fallback */
  }
  const dev = deviceTimeZone();
  return FALLBACK_TIME_ZONES.includes(dev) ? FALLBACK_TIME_ZONES : [dev, ...FALLBACK_TIME_ZONES];
}
