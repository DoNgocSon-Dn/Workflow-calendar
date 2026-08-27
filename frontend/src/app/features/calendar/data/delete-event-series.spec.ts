import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalendarStore } from './calendar-store';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { GroupStore } from '../../groups/data/group-store';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';
import { NotificationService } from '../../../core/services/notification.service';
import { environment } from '../../../../environments/environment';
import { CalendarEvent } from '../models/calendar.models';

/**
 * Xoá một chuỗi sự kiện lặp lại theo 3 phạm vi kiểu Google Calendar, và dữ
 * liệu phải thực sự thay đổi ở backend — không chỉ ẩn khỏi lưới.
 *
 *   'this'      → DELETE /events/:id            (một lần lặp)
 *   'following' → DELETE /events/:id/series?scope=following
 *   'all'       → DELETE /events/:id/series?scope=all
 *
 * `handleRemoteBulkDeleted` là đường mà mọi tab (kể cả tab vừa bấm xoá, và
 * trạng thái sau khi tải lại) nhận danh sách id đã biến mất.
 */
describe('CalendarStore — xoá chuỗi sự kiện lặp lại', () => {
  let store: CalendarStore;
  let http: HttpTestingController;

  function seriesEvent(id: string, day: string): CalendarEvent {
    return {
      id,
      calendarId: 'cal-1',
      title: '1234',
      start: new Date(`2031-04-${day}T19:00:00.000Z`),
      end: new Date(`2031-04-${day}T20:00:00.000Z`),
      allDay: false,
      seriesId: 'series-1',
      recurrenceRule: { freq: 'daily' },
    };
  }

  const wholeSeries = ['01', '02', '03', '04', '05', '06'].map((d) =>
    seriesEvent(`occ-${d}`, d),
  );

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { user: signal(null), session: signal(null) } },
        {
          provide: RealtimeService,
          useValue: {
            connect: () => undefined,
            disconnect: () => undefined,
            onConnect: () => undefined,
            onReconnect: () => undefined,
            on: () => undefined,
            joinCalendar: () => undefined,
          },
        },
        { provide: GroupStore, useValue: { loadGroups: () => Promise.resolve(), groups: () => [] } },
        { provide: NotificationService, useValue: { ingest: () => undefined } },
        {
          provide: SUPABASE_CLIENT,
          useValue: { channel: () => ({ on: () => ({ subscribe: () => undefined }) }) },
        },
      ],
    });

    store = TestBed.inject(CalendarStore);
    http = TestBed.inject(HttpTestingController);
    store.events.set(wholeSeries.map((e) => ({ ...e })));
  });

  it('"Sự kiện này" xoá đúng một lần lặp qua DELETE /events/:id', async () => {
    const promise = store.deleteEventSeries('occ-04', 'this');

    const req = http.expectOne(`${environment.apiUrl}/events/occ-04`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await promise;

    expect(store.events().map((e) => e.id)).toEqual([
      'occ-01', 'occ-02', 'occ-03', 'occ-05', 'occ-06',
    ]);
  });

  it('"Sự kiện này và các sự kiện tiếp theo" gọi scope=following và cắt đúng các id server trả về', async () => {
    const promise = store.deleteEventSeries('occ-04', 'following');

    const req = http.expectOne(
      `${environment.apiUrl}/events/occ-04/series?scope=following`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush({ ids: ['occ-04', 'occ-05', 'occ-06'] });
    await promise;

    expect(store.events().map((e) => e.id)).toEqual(['occ-01', 'occ-02', 'occ-03']);
  });

  it('"Tất cả sự kiện" gọi scope=all và dọn sạch toàn chuỗi khỏi lưới', async () => {
    const promise = store.deleteEventSeries('occ-04', 'all');

    const req = http.expectOne(`${environment.apiUrl}/events/occ-04/series?scope=all`);
    req.flush({ ids: wholeSeries.map((e) => e.id) });
    await promise;

    expect(store.events()).toEqual([]);
  });

  it('backend từ chối xoá chuỗi thì NÉM lỗi (không báo "đã xoá" nhầm)', async () => {
    const promise = store.deleteEventSeries('occ-04', 'all');

    http
      .expectOne(`${environment.apiUrl}/events/occ-04/series?scope=all`)
      .flush({ message: 'Không có quyền' }, { status: 403, statusText: 'Forbidden' });

    await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
    // Lưới giữ nguyên — chưa có gì bị xoá thật.
    expect(store.events().length).toBe(6);
  });

  it('tiếng vọng realtime events:bulk-deleted cắt các id đã xoá — trạng thái sau khi đổi tháng / tải lại', () => {
    (store as unknown as {
      handleRemoteBulkDeleted(p: { calendarId: string; ids: string[] }): void;
    }).handleRemoteBulkDeleted({ calendarId: 'cal-1', ids: ['occ-05', 'occ-06'] });

    expect(store.events().map((e) => e.id)).toEqual([
      'occ-01', 'occ-02', 'occ-03', 'occ-04',
    ]);
  });
});
