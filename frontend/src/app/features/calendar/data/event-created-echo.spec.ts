import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalendarStore } from './calendar-store';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { NotificationQueue } from '../../../core/realtime/notification-queue';
import { GroupStore } from '../../groups/data/group-store';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';
import { NotificationService } from '../../../core/services/notification.service';

const ME = 'user-me';
const SOMEONE_ELSE = 'user-khac';

/**
 * Một lần tạo sự kiện chỉ được sinh MỘT thông báo.
 *
 * Form đã báo "Đã tạo sự kiện" ngay sau khi backend xác nhận. Nhưng backend
 * còn phát `event:created` cho cả phòng lịch — kể cả cho chính người vừa tạo —
 * và tiếng vọng đó từng đẻ thêm một toast "Sự kiện mới" kèm nút Xem chi tiết /
 * Hoãn / Bỏ qua.
 *
 * Chốt chặn cũ (`selfOriginIds`) thua cuộc đua: nó chỉ đánh dấu được SAU khi
 * phản hồi HTTP mang id về, trong khi gói socket được phát ngay lúc insert.
 * Nay việc nhận diện dựa vào `createdBy` do server ghi, nên không còn phụ
 * thuộc thứ tự tới của hai gói tin.
 */
describe('tiếng vọng event:created của chính mình', () => {
  let store: CalendarStore;
  let queue: NotificationQueue;

  const dto = {
    id: 'event-1',
    calendarId: 'cal-1',
    title: 'Đi chơi',
    start: '2026-08-27T02:00:00.000Z',
    end: '2026-08-27T03:00:00.000Z',
    allDay: false,
  };

  /** handleRemoteCreated là private — gọi thẳng để kiểm đúng nhánh xử lý gói
   *  socket, không phải dựng lại cả tầng realtime. */
  function emitCreated(payload: Record<string, unknown>): void {
    (store as unknown as { handleRemoteCreated(d: unknown): void }).handleRemoteCreated(payload);
  }

  beforeEach(() => {
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
    queue = TestBed.inject(NotificationQueue);
    store.events.set([]);
    queue.queue.set([]);
  });

  it('sự kiện do chính mình tạo KHÔNG sinh thông báo "Sự kiện mới"', () => {
    emitCreated({ ...dto, createdBy: ME });
    expect(queue.queue()).toEqual([]);
  });

  it('nhưng vẫn được thêm vào lịch — tab khác của chính mình phải thấy', () => {
    emitCreated({ ...dto, createdBy: ME });
    expect(store.events().map((e) => e.id)).toEqual(['event-1']);
  });

  it('sự kiện do NGƯỜI KHÁC tạo vẫn báo như cũ, kèm các nút thao tác', () => {
    emitCreated({ ...dto, createdBy: SOMEONE_ELSE });

    const items = queue.queue();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Sự kiện mới: Đi chơi');
    expect(items[0].kind).toBe('created');
    // eventId có mặt thì toast mới hiện được nút "Xem chi tiết".
    expect(items[0].eventId).toBe('event-1');
  });

  it('backend chưa gửi createdBy thì rơi về chốt chặn cũ, không nuốt nhầm thông báo của người khác', () => {
    emitCreated(dto);
    expect(queue.queue().length).toBe(1);
  });

  it('gói socket tới TRƯỚC phản hồi HTTP vẫn không sinh thông báo', () => {
    // Đúng trình tự đã gây lỗi: socket về trước, lúc selfOriginIds còn rỗng.
    emitCreated({ ...dto, createdBy: ME });
    // Rồi phản hồi HTTP mới tới và đánh dấu self-origin.
    (store as unknown as { markSelfOrigin(id: string): void }).markSelfOrigin('event-1');

    expect(queue.queue()).toEqual([]);
    expect(store.events().length).toBe(1);
  });
});
