import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ContactsPage } from './contacts-page';
import { SocialStore } from './social.store';
import { SocialApi } from './social-api.service';
import { AuthStore } from '../../core/auth/auth-store';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationService } from '../../core/services/notification.service';
import { DesktopNavigationService } from '../../core/desktop/desktop-navigation.service';
import { emptyOverview } from './social.models';

describe('contacts screen', () => {
  const profile = {
    id: 'peer-a',
    name: 'Người bạn',
    email: 'friend@example.invalid',
    avatarUrl: null,
  };
  let api: {
    overview: ReturnType<typeof vi.fn>;
    messages: ReturnType<typeof vi.fn>;
    action: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    api = {
      overview: vi.fn().mockResolvedValue({
        ...emptyOverview(),
        incoming: [{ id: 'r1', profile }],
        conversations: [
          { profile, lastMessage: null, unreadCount: 0, canMessage: true, blockedByMe: false },
        ],
      }),
      messages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
      action: vi.fn().mockResolvedValue({}),
      send: vi.fn(),
      read: vi.fn().mockResolvedValue({ messageIds: [] }),
    };
    TestBed.configureTestingModule({
      imports: [ContactsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: AuthStore, useValue: { user: signal({ id: 'me' }) } },
        { provide: SocialApi, useValue: api },
        {
          provide: RealtimeService,
          useValue: { connected: signal(true), on: vi.fn(), onConnect: vi.fn() },
        },
        { provide: NotificationService, useValue: { ingest: vi.fn(), markAsRead: vi.fn() } },
        {
          provide: DesktopNavigationService,
          useValue: { pending: signal(null), complete: vi.fn() },
        },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('renders requests and submits acceptance through the real store', async () => {
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    fixture.componentInstance.tab.set('requests');
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    const accept = buttons.find((b) => b.textContent?.trim() === 'Đồng ý');
    expect(accept).toBeTruthy();
    accept!.click();
    await fixture.whenStable();
    expect(api.action).toHaveBeenCalledWith('r1', 'accept');
  });
  it('escapes untrusted message text and keeps the composer empty-safe', async () => {
    api.messages.mockResolvedValue({
      messages: [
        {
          id: 'm',
          senderId: 'peer-a',
          recipientId: 'me',
          body: '<img src=x onerror=alert(1)>',
          clientId: 'k',
          createdAt: '2026-10-31T00:00:00Z',
          readAt: null,
        },
      ],
      hasMore: false,
    });
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    await TestBed.inject(SocialStore).select('peer-a');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.bubble')?.textContent).toContain('<img src=x');
    expect(host.querySelector('.bubble img')).toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.maxLength).toBe(4000);
    expect(host.querySelector<HTMLButtonElement>('.composer button[type=submit]')?.disabled).toBe(
      true,
    );
  });
  it('shows a read-only conversation after blocking', async () => {
    api.overview.mockResolvedValue({
      ...emptyOverview(),
      conversations: [
        { profile, lastMessage: null, unreadCount: 0, canMessage: false, blockedByMe: true },
      ],
    });
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    await TestBed.inject(SocialStore).select('peer-a');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.composer')).toBeNull();
    expect(host.querySelector('.cannot-message')?.textContent).toContain('đã chặn');
    expect(host.textContent).toContain('Bỏ chặn');
  });
});
