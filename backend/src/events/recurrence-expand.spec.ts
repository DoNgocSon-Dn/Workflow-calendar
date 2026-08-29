import { expandRecurrence } from './recurrence.util';

/**
 * Các tuỳ chọn mới của expandRecurrence phục vụ cron top-up (nối dài chuỗi
 * "lặp mãi mãi") và EXDATE (bỏ qua buổi đã xoá lẻ).
 */
describe('expandRecurrence — options', () => {
  const start = new Date('2026-01-01T09:00:00.000Z');
  const end = new Date('2026-01-01T10:00:00.000Z');

  it('không có option: giữ nguyên hành vi cũ (horizon 2 năm)', () => {
    const occ = expandRecurrence(start, end, { freq: 'daily' });
    expect(occ.length).toBe(180); // RECURRENCE_MAX_OCCURRENCES
    expect(occ[0].start.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });

  it('after + until: chỉ lấy các lần lặp trong khoảng (dùng cho top-up)', () => {
    const occ = expandRecurrence(start, end, { freq: 'daily' }, {
      after: new Date('2026-03-01T09:00:00.000Z'),
      until: new Date('2026-03-10T23:59:00.000Z'),
      max: 500,
    });
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('excluded: bỏ qua đúng các mốc EXDATE', () => {
    const skip = new Set<number>([
      new Date('2026-01-03T09:00:00.000Z').getTime(),
      new Date('2026-01-05T09:00:00.000Z').getTime(),
    ]);
    const occ = expandRecurrence(start, end, { freq: 'daily' }, {
      until: new Date('2026-01-07T23:59:00.000Z'),
      excluded: skip,
      max: 500,
    });
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-04',
      '2026-01-06',
      '2026-01-07',
    ]);
  });

  it('endType count: tổng số lần lặp cố định, kể cả khi top-up bằng after', () => {
    // Chuỗi 5 buổi; giả lập top-up sau buổi thứ 2 → chỉ còn 3 buổi được tạo thêm.
    const occ = expandRecurrence(start, end, { freq: 'daily', endType: 'count', count: 5 }, {
      after: new Date('2026-01-02T09:00:00.000Z'),
      until: new Date('2027-01-01T00:00:00.000Z'),
      max: 500,
    });
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual([
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
  });
});
