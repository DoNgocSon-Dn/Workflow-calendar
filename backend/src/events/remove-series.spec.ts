import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

/**
 * Xoá một chuỗi sự kiện lặp lại theo 3 phạm vi kiểu Google Calendar.
 *
 * Mô hình dữ liệu ở dự án này KHÔNG dùng "rrule + danh sách ngoại lệ": mỗi lần
 * lặp đã là một hàng `events` thật, cùng `series_id`. Nên:
 *   - "Sự kiện này"                → xoá mềm ĐÚNG một hàng (remove()).
 *   - "Sự kiện này và các sự kiện tiếp theo" → xoá mềm mọi hàng có
 *     start_at >= hàng đang mở (removeSeries scope 'following').
 *   - "Tất cả sự kiện"             → xoá mềm mọi hàng cùng series_id
 *     (removeSeries scope 'all'), kể cả hàng đã sửa riêng.
 *
 * Xoá mềm = đặt `deleted_at`; findAll() lọc `deleted_at is null` nên chúng
 * không quay lại khi đổi tháng / tải lại trang.
 */

interface Row {
  id: string;
  calendar_id: string;
  series_id: string | null;
  start_at: string;
  deleted_at: string | null;
}

/** Query builder giả lập tối thiểu, có LỌC thật trên mảng hàng trong bộ nhớ,
 *  đủ cho hai chuỗi lệnh mà remove()/removeSeries() dùng. */
class FakeQuery {
  private filters: ((r: Row) => boolean)[] = [];
  private pendingUpdate: Partial<Row> | null = null;
  private selectCols: string[] | null = null;

  constructor(private readonly rows: Row[]) {}

  select(cols: string): this {
    this.selectCols = cols.split(',').map((c) => c.trim());
    return this;
  }
  update(patch: Partial<Row>): this {
    this.pendingUpdate = patch;
    return this;
  }
  eq(col: keyof Row, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  is(col: keyof Row, val: unknown): this {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  gte(col: keyof Row, val: string): this {
    this.filters.push((r) => String(r[col]) >= val);
    return this;
  }
  returns<T>(): Promise<{ data: T; error: null }> {
    return this.run() as Promise<{ data: T; error: null }>;
  }
  maybeSingle<T>(): Promise<{ data: T | null; error: null }> {
    const matched = this.match();
    return Promise.resolve({ data: (matched[0] as T) ?? null, error: null });
  }
  then<TResult1 = unknown>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1) | null,
  ): Promise<TResult1> {
    return this.run().then(onfulfilled ?? undefined) as Promise<TResult1>;
  }

  private match(): Row[] {
    return this.rows.filter((r) => this.filters.every((f) => f(r)));
  }
  private async run(): Promise<{ data: unknown[]; error: null }> {
    const matched = this.match();
    if (this.pendingUpdate) {
      for (const r of matched) Object.assign(r, this.pendingUpdate);
    }
    const data = matched.map((r) => {
      if (!this.selectCols) return { ...r };
      const out: Record<string, unknown> = {};
      for (const c of this.selectCols) out[c] = (r as unknown as Record<string, unknown>)[c];
      return out;
    });
    return { data, error: null };
  }
}

function makeSupabase(rows: Row[]) {
  return { from: () => new FakeQuery(rows) } as unknown as Parameters<
    EventsService['removeSeries']
  >[0];
}

function dailySeries(): Row[] {
  return ['01', '02', '03', '04', '05', '06'].map((d) => ({
    id: `occ-${d}`,
    calendar_id: 'C1',
    series_id: 'S1',
    start_at: `2031-04-${d}T19:00:00.000Z`,
    deleted_at: null,
  }));
}

function liveIds(rows: Row[]): string[] {
  return rows.filter((r) => r.deleted_at === null).map((r) => r.id);
}

describe('EventsService.removeSeries — 3 phạm vi xoá chuỗi lặp lại', () => {
  let realtime: { emitToCalendar: jest.Mock; emitToUser: jest.Mock };
  let service: EventsService;

  beforeEach(() => {
    realtime = { emitToCalendar: jest.fn(), emitToUser: jest.fn() };
    service = new EventsService(
      realtime as never,
      {} as never,
      { get: jest.fn() } as never,
    );
  });

  it('"Sự kiện này" (remove) chỉ xoá mềm đúng một lần lặp, giữ nguyên phần còn lại', async () => {
    const rows = dailySeries();
    await service.remove(makeSupabase(rows), 'occ-04');

    expect(liveIds(rows)).toEqual(['occ-01', 'occ-02', 'occ-03', 'occ-05', 'occ-06']);
    expect(rows.find((r) => r.id === 'occ-04')!.deleted_at).not.toBeNull();
    expect(realtime.emitToCalendar).toHaveBeenCalledWith('C1', 'event:deleted', { id: 'occ-04' });
  });

  it('"Sự kiện này và các sự kiện tiếp theo" xoá từ ngày đang mở trở đi, giữ các ngày trước', async () => {
    const rows = dailySeries();
    const result = await service.removeSeries(makeSupabase(rows), 'occ-04', 'following');

    expect(new Set(result.ids)).toEqual(new Set(['occ-04', 'occ-05', 'occ-06']));
    expect(liveIds(rows)).toEqual(['occ-01', 'occ-02', 'occ-03']);
    expect(realtime.emitToCalendar).toHaveBeenCalledWith('C1', 'events:bulk-deleted', {
      calendarId: 'C1',
      ids: expect.arrayContaining(['occ-04', 'occ-05', 'occ-06']),
    });
  });

  it('"Tất cả sự kiện" xoá sạch mọi lần lặp cùng series_id — kể cả quá khứ', async () => {
    const rows = dailySeries();
    const result = await service.removeSeries(makeSupabase(rows), 'occ-04', 'all');

    expect(result.ids.length).toBe(6);
    expect(liveIds(rows)).toEqual([]);
  });

  it('"Tất cả sự kiện" cũng cuốn theo lần lặp đã được SỬA RIÊNG (đổi giờ) — không để lại mồ côi', async () => {
    const rows = dailySeries();
    // occ-04 được kéo sang 20:00 nhưng vẫn thuộc series (không tách series_id).
    rows.find((r) => r.id === 'occ-04')!.start_at = '2031-04-04T20:00:00.000Z';

    await service.removeSeries(makeSupabase(rows), 'occ-01', 'all');
    expect(liveIds(rows)).toEqual([]);
  });

  it('"...và các sự kiện tiếp theo" tính mốc theo start_at của hàng đang mở, gồm cả bản đã sửa riêng', async () => {
    const rows = dailySeries();
    rows.find((r) => r.id === 'occ-05')!.start_at = '2031-04-05T21:00:00.000Z';

    const result = await service.removeSeries(makeSupabase(rows), 'occ-03', 'following');
    expect(new Set(result.ids)).toEqual(new Set(['occ-03', 'occ-04', 'occ-05', 'occ-06']));
    expect(liveIds(rows)).toEqual(['occ-01', 'occ-02']);
  });

  it('không đụng tới lần lặp đã bị xoá mềm trước đó (is deleted_at null)', async () => {
    const rows = dailySeries();
    rows.find((r) => r.id === 'occ-02')!.deleted_at = '2031-01-01T00:00:00.000Z';
    const before = rows.find((r) => r.id === 'occ-02')!.deleted_at;

    const result = await service.removeSeries(makeSupabase(rows), 'occ-01', 'all');
    expect(result.ids).not.toContain('occ-02');
    expect(rows.find((r) => r.id === 'occ-02')!.deleted_at).toBe(before);
  });

  it('sự kiện KHÔNG thuộc chuỗi lặp nào thì rơi về xoá đơn, trả đúng id', async () => {
    const rows: Row[] = [
      { id: 'plain-1', calendar_id: 'C1', series_id: null, start_at: '2031-04-04T19:00:00.000Z', deleted_at: null },
    ];
    const result = await service.removeSeries(makeSupabase(rows), 'plain-1', 'all');

    expect(result).toEqual({ ids: ['plain-1'], calendarId: 'C1' });
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('id không tồn tại → NotFoundException', async () => {
    await expect(
      service.removeSeries(makeSupabase(dailySeries()), 'khong-co', 'all'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('xoá lần lặp cuối cùng của chuỗi chỉ còn một occurrence bằng "Tất cả sự kiện"', async () => {
    const rows: Row[] = [
      { id: 'only-1', calendar_id: 'C1', series_id: 'S9', start_at: '2031-04-04T19:00:00.000Z', deleted_at: null },
    ];
    const result = await service.removeSeries(makeSupabase(rows), 'only-1', 'all');
    expect(result.ids).toEqual(['only-1']);
    expect(liveIds(rows)).toEqual([]);
  });
});
