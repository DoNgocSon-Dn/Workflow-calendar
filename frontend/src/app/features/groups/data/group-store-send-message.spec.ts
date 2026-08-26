import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupStore } from './group-store';
import { GroupApiService } from '../services/group-api.service';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';
import { GroupMessage } from '../models/group.models';

const ME = 'user-me';

/** Tin nhắn "thật" như server trả về / socket đẩy tới. */
function serverMessage(id: string, message: string, senderId = ME): GroupMessage {
  return {
    id,
    groupId: 'g1',
    senderId,
    message,
    createdAt: '2026-08-26T10:00:00.000Z',
  };
}

/** Supabase client giả: store chỉ dùng nó để mở kênh realtime và tải tệp lên,
 *  không đụng tới trong các luồng được kiểm ở đây. */
const supabaseStub = {
  channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
};

describe('GroupStore.sendMessage — hiển thị lạc quan và chống trùng', () => {
  let store: GroupStore;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessage = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: GroupApiService, useValue: { sendMessage } },
        {
          provide: AuthStore,
          useValue: { user: () => ({ id: ME, email: 'me@example.com' }), session: () => null },
        },
        {
          provide: RealtimeService,
          useValue: {
            connect: () => undefined,
            onConnect: () => undefined,
            onReconnect: () => undefined,
            on: () => undefined,
            joinCalendar: () => undefined,
          },
        },
        { provide: NotificationService, useValue: { ingest: () => undefined } },
        { provide: SUPABASE_CLIENT, useValue: supabaseStub },
      ],
    });

    store = TestBed.inject(GroupStore);
    store.messages.set([]);
  });

  it('tin nhắn hiện lên NGAY, trước khi server trả lời', () => {
    // Promise không bao giờ resolve: mô phỏng mạng chậm.
    sendMessage.mockReturnValue(new Promise<GroupMessage>(() => undefined));

    void store.sendMessage('g1', 'xin chào');

    // Không await gì cả — nếu phải chờ API thì dòng này đã thấy danh sách rỗng.
    expect(store.messages().length).toBe(1);
    expect(store.messages()[0].message).toBe('xin chào');
    expect(store.messages()[0].pending).toBe(true);
  });

  it('bản lạc quan được thay bằng tin nhắn thật, không nhân đôi', async () => {
    const saved = serverMessage('real-1', 'xin chào');
    sendMessage.mockResolvedValue(saved);

    await store.sendMessage('g1', 'xin chào');

    expect(store.messages().length).toBe(1);
    expect(store.messages()[0].id).toBe('real-1');
    expect(store.messages()[0].pending).toBeUndefined();
  });

  it('tiếng vọng realtime tới TRƯỚC phản hồi HTTP vẫn không tạo bản sao', async () => {
    const saved = serverMessage('real-1', 'xin chào');
    let resolveHttp: (msg: GroupMessage) => void = () => undefined;
    sendMessage.mockReturnValue(
      new Promise<GroupMessage>((resolve) => {
        resolveHttp = resolve;
      }),
    );

    const sending = store.sendMessage('g1', 'xin chào');

    // Socket đẩy tin nhắn về trước khi HTTP kịp trả lời.
    (store as unknown as { upsertMessage(m: GroupMessage): void }).upsertMessage(saved);
    expect(store.messages().length).toBe(1);
    expect(store.messages()[0].id).toBe('real-1');

    resolveHttp(saved);
    await sending;

    expect(store.messages().length).toBe(1);
    expect(store.messages()[0].id).toBe('real-1');
  });

  it('hai tin nhắn NỘI DUNG GIỐNG HỆT gửi liên tiếp vẫn còn đủ hai', async () => {
    const first = serverMessage('real-1', 'ok');
    const second = serverMessage('real-2', 'ok');

    const pending: Array<(msg: GroupMessage) => void> = [];
    sendMessage.mockImplementation(
      () => new Promise<GroupMessage>((resolve) => pending.push(resolve)),
    );

    const a = store.sendMessage('g1', 'ok');
    const b = store.sendMessage('g1', 'ok');
    expect(store.messages().length).toBe(2);

    // Tiếng vọng về theo thứ tự bất kỳ; bản lạc quan nào cũng có thể bị ghép.
    const upsert = (store as unknown as { upsertMessage(m: GroupMessage): void }).upsertMessage.bind(
      store,
    );
    upsert(second);
    upsert(first);

    pending[0](first);
    pending[1](second);
    await Promise.all([a, b]);

    expect(store.messages().map((m) => m.id).sort()).toEqual(['real-1', 'real-2']);
  });

  it('gửi hỏng thì bản lạc quan bị gỡ đi, không để lại tin nhắn ma', async () => {
    sendMessage.mockRejectedValue(new Error('mạng lỗi'));

    await expect(store.sendMessage('g1', 'xin chào')).rejects.toThrow('mạng lỗi');
    expect(store.messages()).toEqual([]);
  });

  it('tin nhắn của người khác không bao giờ bị ghép vào bản lạc quan của mình', () => {
    sendMessage.mockReturnValue(new Promise<GroupMessage>(() => undefined));
    void store.sendMessage('g1', 'xin chào');

    (store as unknown as { upsertMessage(m: GroupMessage): void }).upsertMessage(
      serverMessage('real-9', 'xin chào', 'user-khac'),
    );

    expect(store.messages().length).toBe(2);
  });
});
