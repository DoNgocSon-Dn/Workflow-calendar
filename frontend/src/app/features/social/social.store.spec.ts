import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SocialStore } from './social.store';
import { SocialApi } from './social-api.service';
import { AuthStore } from '../../core/auth/auth-store';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationService } from '../../core/services/notification.service';
import { DirectMessage, SocialOverview, emptyOverview } from './social.models';

const message = (id = 'm1', senderId = 'a', recipientId = 'me'): DirectMessage => ({
  id,
  senderId,
  recipientId,
  clientId: `client-${id}`,
  body: 'Hello',
  createdAt: '2026-10-31T00:00:00Z',
  readAt: null,
});
const overview = (): SocialOverview => ({
  ...emptyOverview(),
  friends: [
    {
      id: 'friend-a',
      profile: { id: 'a', name: 'A', email: 'a@example.invalid', avatarUrl: null },
    },
  ],
  conversations: ['a', 'b'].map((id) => ({
    profile: { id, name: id.toUpperCase(), email: `${id}@example.invalid`, avatarUrl: null },
    lastMessage: null,
    unreadCount: 0,
    canMessage: true,
    blockedByMe: false,
  })),
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('private conversations state', () => {
  let store: SocialStore;
  let user: ReturnType<typeof signal<{ id: string } | null>>;
  let api: Record<
    'overview' | 'messages' | 'send' | 'read' | 'request' | 'action' | 'block' | 'code' | 'requestCode',
    ReturnType<typeof vi.fn>
  >;
  let listeners: Record<string, (payload: any) => void>;
  let notifications: { ingest: ReturnType<typeof vi.fn>; markAsRead: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    user = signal<{ id: string } | null>({ id: 'me' });
    listeners = {};
    api = {
      overview: vi.fn().mockResolvedValue(overview()),
      messages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
      send: vi.fn(),
      read: vi.fn().mockImplementation(async (ids) => ({ messageIds: ids })),
      request: vi.fn().mockResolvedValue({}),
      action: vi.fn().mockResolvedValue({}),
      block: vi.fn().mockResolvedValue({}),
      code: vi.fn().mockResolvedValue({ code: 'WF-A1B2-C3D4-E5F6' }),
      requestCode: vi.fn().mockResolvedValue({}),
    };
    notifications = { ingest: vi.fn(), markAsRead: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { user } },
        { provide: SocialApi, useValue: api },
        {
          provide: RealtimeService,
          useValue: {
            connected: signal(true),
            on: (event: string, cb: (p: any) => void) => (listeners[event] = cb),
            onConnect: vi.fn(),
          },
        },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    store = TestBed.inject(SocialStore);
    TestBed.tick();
    await Promise.resolve();
  });
  afterEach(() => TestBed.resetTestingModule());
  it('hides and discards another account’s share code after logout', async () => {
    const pending = deferred<{ code: string }>();
    api.code.mockReturnValue(pending.promise);
    const load = store.loadFriendCode();
    user.set({ id: 'other' }); TestBed.tick();
    pending.resolve({ code: 'WF-A1B2-C3D4-E5F6' }); await load;
    expect(store.friendCode()).toBeNull();
  });
  it('updates incoming friend requests immediately after a socket change', async () => {
    api.overview.mockResolvedValue({ ...overview(), incoming: [{ id: 'r-new', profile: overview().friends[0].profile }] });
    listeners['social:changed']({});
    await Promise.resolve();
    expect(store.overview().incoming.map(r => r.id)).toEqual(['r-new']);
    expect(store.badge()).toBe(1);
  });
  it('recovers missed messages and requests on resume without losing a draft', async () => {
    await store.select('a');
    store.setDraft('unfinished text');
    api.messages.mockResolvedValue({ messages: [message('missed')], hasMore: false });
    api.overview.mockResolvedValue({ ...overview(), incoming: [{ id: 'r-new', profile: overview().friends[0].profile }] });
    window.dispatchEvent(new Event('focus'));
    await store.resync();
    expect(store.messages().map(m => m.id)).toEqual(['missed']);
    expect(store.badge()).toBe(1);
    expect(store.draft()).toBe('unfinished text');
  });
  it('fetches again after private room readiness if a pre-auth snapshot is in flight', async () => {
    const pending = deferred<SocialOverview>();
    api.overview.mockReturnValueOnce(pending.promise).mockResolvedValue({ ...overview(), incoming: [{ id: 'after-join', profile: overview().friends[0].profile }] });
    const beforeReady = store.resync();
    listeners['session:ready']({});
    pending.resolve(overview());
    await beforeReady;
    // The readiness handler schedules a second, post-join snapshot.
    await Promise.resolve();
    await store.resync();
    expect(store.overview().incoming.map(r => r.id)).toEqual(['after-join']);
  });
  it('coalesces resume requests but allows another account to resync independently', async () => {
    const pending = deferred<SocialOverview>();
    api.overview.mockReturnValueOnce(pending.promise);
    const first = store.resync();
    expect(store.resync()).toBe(first);
    user.set({ id: 'other' });
    TestBed.tick();
    const second = store.resync();
    expect(second).not.toBe(first);
    await second;
    pending.resolve({ ...overview(), incoming: [{ id: 'old', profile: overview().friends[0].profile }] });
    await first;
    expect(store.overview().incoming).toEqual([]);
  });
  it('recovers an unread alert when refreshing after a disconnected socket', async () => {
    const data = overview();
    data.conversations[0].lastMessage = message('missed');
    data.conversations[0].unreadCount = 1;
    api.overview.mockResolvedValue(data);
    await store.refresh();
    expect(notifications.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'direct-missed', metadata: { directPeerId: 'a' } }),
    );
  });
  it('hides all account data synchronously on logout', async () => {
    api.messages.mockResolvedValue({ messages: [message()], hasMore: false });
    await store.select('a');
    store.setDraft('private draft');
    user.set(null);
    expect(store.overview()).toEqual(emptyOverview());
    expect(store.messages()).toEqual([]);
    expect(store.draft()).toBe('');
    TestBed.tick();
    user.set({ id: 'other' });
    TestBed.tick();
    await Promise.resolve();
    expect(store.peer()).toBeNull();
    expect(store.messages()).toEqual([]);
  });
  it('discards an old account response after switching users', async () => {
    const pending = deferred<SocialOverview>();
    api.overview.mockReturnValueOnce(pending.promise);
    const refresh = store.refresh();
    user.set({ id: 'other' });
    TestBed.tick();
    await Promise.resolve();
    pending.resolve({
      ...overview(),
      incoming: [{ id: 'old-private', profile: overview().friends[0].profile }],
    });
    await refresh;
    expect(store.overview().incoming).toEqual([]);
  });
  it('does not mix messages when selecting another peer during loading', async () => {
    const pending = deferred<{ messages: DirectMessage[]; hasMore: boolean }>();
    api.messages.mockReturnValueOnce(pending.promise);
    const first = store.select('a');
    await store.select('b');
    pending.resolve({ messages: [message()], hasMore: true });
    await first;
    expect(store.peer()).toBe('b');
    expect(store.messages()).toEqual([]);
    expect(store.hasMore()).toBe(false);
  });
  it('keeps a realtime message that arrives while history is loading', async () => {
    const pending = deferred<{ messages: DirectMessage[]; hasMore: boolean }>();
    api.messages.mockReturnValueOnce(pending.promise);
    const select = store.select('a');
    listeners['direct:message'](message('m2'));
    pending.resolve({ messages: [message('m1')], hasMore: false });
    await select;
    expect(store.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
  });
  it('deduplicates the realtime echo and HTTP response', async () => {
    await store.select('a');
    store.setDraft('Hello');
    const saved = message('m1', 'me', 'a');
    api.send.mockImplementation(async () => {
      listeners['direct:message'](saved);
      return saved;
    });
    await store.send();
    expect(store.messages()).toEqual([saved]);
    expect(store.draft()).toBe('');
  });
  it('preserves text and reuses the same key after an uncertain send failure', async () => {
    await store.select('a');
    store.setDraft('Hello');
    api.send
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }))
      .mockResolvedValueOnce(message('m1', 'me', 'a'));
    await store.send();
    expect(store.draft()).toBe('Hello');
    await store.send();
    expect(api.send.mock.calls[0]).toEqual(api.send.mock.calls[1]);
    expect(store.draft()).toBe('');
  });
  it('does not erase text typed while a previous send is pending', async () => {
    await store.select('a');
    store.setDraft('old');
    const pending = deferred<DirectMessage>();
    api.send.mockReturnValue(pending.promise);
    const send = store.send();
    store.setDraft('new text');
    pending.resolve(message('m1', 'me', 'a'));
    await send;
    expect(store.draft()).toBe('new text');
  });
  it('does not append a send response to a different conversation', async () => {
    await store.select('a');
    store.setDraft('Hello');
    const pending = deferred<DirectMessage>();
    api.send.mockReturnValue(pending.promise);
    const send = store.send();
    await store.select('b');
    store.setDraft('draft B');
    pending.resolve(message('m1', 'me', 'a'));
    await send;
    expect(store.messages()).toEqual([]);
    expect(store.draft()).toBe('draft B');
  });
  it('does not acknowledge a background conversation', async () => {
    api.messages.mockResolvedValue({ messages: [message()], hasMore: false });
    await store.select('a');
    expect(api.read).not.toHaveBeenCalled();
    listeners['direct:message'](message('m2'));
    expect(notifications.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'direct-m2', metadata: { directPeerId: 'a' } }),
    );
  });
  it('acknowledges only incoming messages in the visible conversation', async () => {
    api.messages.mockResolvedValue({
      messages: [message(), message('m2', 'me', 'a')],
      hasMore: false,
    });
    await store.select('a');
    store.setVisible('a');
    await Promise.resolve();
    expect(api.read).toHaveBeenCalledExactlyOnceWith(['m1']);
    expect(notifications.markAsRead).toHaveBeenCalledWith('direct-m1');
  });
  it('does not loop indefinitely when the server acknowledges no IDs', async () => {
    api.read.mockResolvedValue({ messageIds: [] });
    api.messages.mockResolvedValue({ messages: [message()], hasMore: false });
    await store.select('a');
    store.setVisible('a');
    await Promise.resolve();
    await Promise.resolve();
    expect(api.read).toHaveBeenCalledOnce();
  });
  it('updates receipts only for the matching recipient', async () => {
    api.messages.mockResolvedValue({ messages: [message('m1', 'me', 'a')], hasMore: false });
    await store.select('a');
    listeners['direct:read']({ readerId: 'b', messageIds: ['m1'] });
    expect(store.messages()[0].readAt).toBeNull();
    listeners['direct:read']({ readerId: 'a', messageIds: ['m1'] });
    expect(store.messages()[0].readAt).toBeTruthy();
  });
  it('ignores unrelated socket messages', () => {
    listeners['direct:message'](message('foreign', 'x', 'y'));
    expect(notifications.ingest).not.toHaveBeenCalled();
    expect(store.messages()).toEqual([]);
  });
  it('blocks an empty send and a send to a non-friend', async () => {
    await store.select('a');
    store.setDraft('  ');
    await store.send();
    expect(api.send).not.toHaveBeenCalled();
    api.overview.mockResolvedValue({
      ...overview(),
      conversations: overview().conversations.map((c) => ({ ...c, canMessage: false })),
    });
    await store.refresh();
    store.setDraft('Hi');
    await store.send();
    expect(api.send).not.toHaveBeenCalled();
  });
  it('loads older messages without duplicating overlapping pages', async () => {
    api.messages
      .mockResolvedValueOnce({ messages: [message('m2')], hasMore: true })
      .mockResolvedValueOnce({ messages: [message('m1'), message('m2')], hasMore: false });
    await store.select('a');
    await store.older();
    expect(api.messages).toHaveBeenLastCalledWith('a', 'm2');
    expect(store.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(store.hasMore()).toBe(false);
  });
});
