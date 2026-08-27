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

/**
 * Sự kiện tạo xong phải nằm trong cơ sở dữ liệu, không phải chỉ trong RAM.
 *
 * Trước đây `createEvent` bắt mọi lỗi rồi dựng một sự kiện `local-...` chỉ
 * sống trong bộ nhớ và trả về như thể đã lưu — form đóng lại, sự kiện hiện
 * trên lịch, và tải lại trang là mất. Bộ test này khoá lại đúng chỗ đó: hỏng
 * thì phải ném lỗi và KHÔNG để lại gì trên lịch.
 */
describe('CalendarStore.createEvent — chỉ coi là xong khi backend đã lưu', () => {
  let store: CalendarStore;
  let http: HttpTestingController;

  const draft = {
    title: 'Họp nhóm',
    calendarId: '11111111-1111-4111-8111-111111111111',
    allDay: false,
    start: new Date('2026-09-01T09:00:00.000Z'),
    end: new Date('2026-09-01T10:00:00.000Z'),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // user() = null nên effect khởi động KHÔNG gọi loadAll() — bài test
        // này chỉ quan tâm tới đúng một request POST /events.
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
    store.events.set([]);
  });

  it('lưu thành công thì sự kiện thật (id từ server) vào lịch', async () => {
    const promise = store.createEvent(draft);

    const req = http.expectOne(`${environment.apiUrl}/events`);
    expect(req.request.method).toBe('POST');
    // Ngày giờ phải đi lên dạng ISO, không phải đối tượng Date.
    expect(req.request.body.start).toBe('2026-09-01T09:00:00.000Z');
    expect(req.request.body.calendarId).toBe(draft.calendarId);

    req.flush({
      id: 'server-event-1',
      calendarId: draft.calendarId,
      title: 'Họp nhóm',
      start: '2026-09-01T09:00:00.000Z',
      end: '2026-09-01T10:00:00.000Z',
      allDay: false,
    });

    const created = await promise;
    expect(created.id).toBe('server-event-1');
    expect(store.events().map((e) => e.id)).toEqual(['server-event-1']);
  });

  it('backend từ chối thì NÉM lỗi và không để lại sự kiện nào trên lịch', async () => {
    const promise = store.createEvent(draft);

    http
      .expectOne(`${environment.apiUrl}/events`)
      .flush({ message: 'Không có quyền ghi vào lịch này' }, { status: 403, statusText: 'Forbidden' });

    await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(store.events()).toEqual([]);
  });

  it('mất mạng cũng ném lỗi, KHÔNG tự lưu cục bộ', async () => {
    const promise = store.createEvent(draft);

    http
      .expectOne(`${environment.apiUrl}/events`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
    // Đây là điểm mấu chốt: không được còn sự kiện "local-..." nào sót lại,
    // vì nó sẽ biến mất ngay lần tải lại trang tiếp theo.
    expect(store.events()).toEqual([]);
  });

  it('sau khi tải lại trang, lịch được dựng lại từ dữ liệu backend', async () => {
    // Mô phỏng vòng đời sau reload: store rỗng, rồi loadAll() kéo dữ liệu về.
    expect(store.events()).toEqual([]);

    const loading = store.loadAll();
    http.expectOne(`${environment.apiUrl}/calendars`).flush([
      { id: draft.calendarId, name: 'Cá nhân', color: 'blue' },
    ]);
    http.expectOne(`${environment.apiUrl}/events`).flush([
      {
        id: 'server-event-1',
        calendarId: draft.calendarId,
        title: 'Họp nhóm',
        start: '2026-09-01T09:00:00.000Z',
        end: '2026-09-01T10:00:00.000Z',
        allDay: false,
      },
    ]);
    await loading;

    expect(store.events().map((e) => e.id)).toEqual(['server-event-1']);

    // loadAll còn bắn vài request phụ (lời mời, todo, nhắc lịch bỏ lỡ) không
    // thuộc phạm vi bài test này — dọn để chúng không bị báo là request treo.
    for (const pending of http.match(() => true)) pending.flush([]);
  });
});
