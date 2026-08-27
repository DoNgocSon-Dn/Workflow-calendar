import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalendarStore } from './calendar-store';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { GroupStore } from '../../groups/data/group-store';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';
import { NotificationService } from '../../../core/services/notification.service';
import { environment } from '../../../../environments/environment';

const ME = 'user-me';

/** setTimeout thật, không dùng fake timers: debounceTime của RxJS dùng
 *  asyncScheduler nội bộ, fake timers của vitest không phải lúc nào cũng chặn
 *  được, nên chờ thời gian thật là cách chắc chắn nhất — chấp nhận vài trăm
 *  mili-giây chạy chậm hơn để đổi lấy một bài test không phập phù. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Xả hết mọi request đang treo trên `http`, kể cả những request chỉ xuất
 *  hiện SAU khi lượt trước đã được flush (vd loadAll() gọi calendars+events
 *  rồi mới, sau khi cả hai xong, bắn tiếp lời mời/todo/nhắc lịch). Dừng sớm
 *  ngay khi không còn gì đang chờ. */
async function drainAllPending(http: HttpTestingController): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = http.match(() => true);
    if (pending.length === 0) return;
    for (const req of pending) req.flush([]);
  }
}

/**
 * Nhiều gói `attendee:invited` liên tiếp (được mời vào nhiều sự kiện gần như
 * cùng lúc) không được phép mỗi gói gọi một lượt GET /events riêng — đó là
 * chính vấn đề mà cơ chế debounce 500ms này giải quyết.
 */
describe('CalendarStore — debounce tải lại khi được mời dồn dập', () => {
  let store: CalendarStore;
  let http: HttpTestingController;

  /** handleAttendeeInvited là private — gọi thẳng để kiểm đúng nhánh xử lý
   *  gói realtime, không cần dựng lại toàn bộ tầng socket. */
  function invite(eventId: string): void {
    (store as unknown as { handleAttendeeInvited(p: unknown): void }).handleAttendeeInvited({
      eventId,
      attendee: { id: `att-${eventId}`, userId: ME, email: 'me@example.com', status: 'pending' },
    });
  }

  function pendingEventsRequests() {
    return http.match((req) => req.method === 'GET' && req.url === `${environment.apiUrl}/events`);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { user: signal({ id: ME }), session: signal(null) } },
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
        { provide: GroupStore, useValue: { loadGroups: () => Promise.resolve() } },
        { provide: NotificationService, useValue: { ingest: () => undefined } },
        {
          provide: SUPABASE_CLIENT,
          useValue: { channel: () => ({ on: () => ({ subscribe: () => undefined }) }) },
        },
      ],
    });

    store = TestBed.inject(CalendarStore);
    http = TestBed.inject(HttpTestingController);

    // CalendarStore tự gọi loadAll() trong constructor (effect theo dõi
    // authStore.user() — không liên quan gì tới debounce đang kiểm ở đây).
    // Dọn sạch lứa request khởi tạo đó (calendars/events/lời mời/todo/nhắc
    // lịch...) trước khi bắt đầu kịch bản thật, nếu không chúng lẫn vào phép
    // đếm request bên dưới.
    await drainAllPending(http);

    store.events.set([]);
  });

  // BẮT BUỘC: mỗi test phải tự flush hết request nó gây ra. Một request GET
  // /events bị bỏ mặc chưa flush là một Promise refreshEvents() treo vĩnh
  // viễn — timer thật (không phải fake) vẫn chạy ngầm sau khi test này kết
  // thúc, và lần .flush() muộn màng đó có thể rơi đúng vào lúc một FILE TEST
  // KHÁC đang chạy, làm hỏng test của họ theo cách không liên quan gì tới
  // debounce cả. verify() ở đây buộc lỗi này phải lộ ra NGAY tại file này.
  afterEach(async () => {
    await drainAllPending(http);
    http.verify();
  });

  it('3 lời mời liên tiếp chỉ gọi GET /events đúng MỘT lần', async () => {
    invite('event-1');
    invite('event-2');
    invite('event-3');

    // Ngay sau ba lời mời: chưa tới 500ms nên chưa có request nào cả — đây
    // chính là phần "reload ngầm", không phải "reload ngay cho từng event".
    expect(pendingEventsRequests().length).toBe(0);

    await sleep(700);

    const requests = pendingEventsRequests();
    expect(requests.length).toBe(1);
    requests[0].flush([
      { id: 'event-1', calendarId: 'cal-1', title: 'Họp A', start: '2026-09-01T09:00:00.000Z', end: '2026-09-01T10:00:00.000Z', allDay: false },
      { id: 'event-2', calendarId: 'cal-1', title: 'Họp B', start: '2026-09-02T09:00:00.000Z', end: '2026-09-02T10:00:00.000Z', allDay: false },
      { id: 'event-3', calendarId: 'cal-1', title: 'Họp C', start: '2026-09-03T09:00:00.000Z', end: '2026-09-03T10:00:00.000Z', allDay: false },
    ]);
    // flush() giao dữ liệu ĐỒNG BỘ cho subscriber, nhưng phần code SAU
    // `await firstValueFrom(...)` bên trong refreshEvents() (chỗ gọi
    // events.set()) chỉ chạy ở microtask kế tiếp — phải nhường một nhịp
    // trước khi kiểm tra state, nếu không sẽ đọc phải state CŨ.
    await Promise.resolve();
    await Promise.resolve();

    expect(store.events().map((e) => e.id).sort()).toEqual(['event-1', 'event-2', 'event-3']);
  });

  it('lời mời mới trong vòng 500ms RESET đồng hồ, không tải lại sớm', async () => {
    invite('event-1');
    await sleep(300);
    // Chưa hết 500ms từ lời mời đầu — vẫn chưa có request.
    expect(pendingEventsRequests().length).toBe(0);

    invite('event-2'); // reset đồng hồ
    await sleep(300);
    // Mới 300ms tính từ lời mời THỨ HAI — vẫn phải im lặng dù tổng cộng đã
    // 600ms tính từ lời mời đầu tiên. Nếu đồng hồ không được reset đúng, chỗ
    // này sẽ thấy 1 request và test thất bại.
    expect(pendingEventsRequests().length).toBe(0);

    await sleep(300); // đủ 600ms từ lời mời thứ hai
    expect(pendingEventsRequests().length).toBe(1);
  });

  it('không tạo nhiều lần đăng ký debounce trùng nhau qua nhiều đợt mời', async () => {
    invite('event-1');
    await sleep(700);
    pendingEventsRequests()[0].flush([]);

    invite('event-2');
    await sleep(700);

    // Đợt thứ hai vẫn chỉ đúng MỘT request mới — không phải hai (một từ
    // subscription "cũ" bị rò rỉ cộng dồn, một từ subscription hiện tại).
    expect(pendingEventsRequests().length).toBe(1);
  });
});
