import { describe, expect, it } from 'vitest';
import { formatTzOffset, sameOffset, utcToZonedWall, zonedWallTimeToUtc } from './tz-utils';

describe('zonedWallTimeToUtc', () => {
  it('chuyển giờ treo tường ở New York (mùa hè, EDT = GMT-4) sang UTC', () => {
    // 1/9/2026 09:00 tại New York = 13:00 UTC
    const utc = zonedWallTimeToUtc(2026, 9, 1, 9, 0, 'America/New_York');
    expect(utc.toISOString()).toBe('2026-09-01T13:00:00.000Z');
  });

  it('chuyển giờ treo tường ở New York (mùa đông, EST = GMT-5) sang UTC', () => {
    const utc = zonedWallTimeToUtc(2026, 1, 15, 9, 0, 'America/New_York');
    expect(utc.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('Asia/Ho_Chi_Minh (GMT+7, không DST)', () => {
    const utc = zonedWallTimeToUtc(2026, 6, 10, 15, 30, 'Asia/Ho_Chi_Minh');
    expect(utc.toISOString()).toBe('2026-06-10T08:30:00.000Z');
  });

  it('vòng lặp UTC → wall → UTC ổn định', () => {
    const start = new Date('2026-03-29T01:30:00.000Z');
    const w = utcToZonedWall(start, 'Europe/Paris');
    const back = zonedWallTimeToUtc(w.year, w.mon, w.day, w.hour, w.minute, 'Europe/Paris');
    expect(back.getTime()).toBe(start.getTime());
  });
});

describe('formatTzOffset', () => {
  it('GMT+7 cho Việt Nam', () => {
    expect(formatTzOffset('Asia/Ho_Chi_Minh', new Date('2026-06-01T00:00:00Z'))).toBe('GMT+7');
  });
  it('GMT-4 cho New York mùa hè', () => {
    expect(formatTzOffset('America/New_York', new Date('2026-07-01T00:00:00Z'))).toBe('GMT-4');
  });
});

describe('sameOffset', () => {
  it('Bangkok và Ho Chi Minh cùng offset', () => {
    expect(sameOffset('Asia/Bangkok', 'Asia/Ho_Chi_Minh', new Date('2026-06-01T00:00:00Z'))).toBe(true);
  });
  it('Tokyo khác Ho Chi Minh', () => {
    expect(sameOffset('Asia/Tokyo', 'Asia/Ho_Chi_Minh', new Date('2026-06-01T00:00:00Z'))).toBe(false);
  });
});
