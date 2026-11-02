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
import { Capacitor } from '@capacitor/core';

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
    request: ReturnType<typeof vi.fn>;
    code: ReturnType<typeof vi.fn>;
    requestCode: ReturnType<typeof vi.fn>;
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
      request: vi.fn().mockResolvedValue({}),
      code: vi.fn().mockResolvedValue({ code: 'WF-A1B2-C3D4-E5F6' }),
      requestCode: vi.fn().mockResolvedValue({}),
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
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it('opens the add-friend form, blocks invalid emails and closes after success', async () => {
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#friend-email')).toBeNull();
    fixture.componentInstance.toggleAddContact();
    fixture.componentInstance.setAddMethod('email');
    await fixture.whenStable();
    const input = host.querySelector<HTMLInputElement>('#friend-email')!;
    input.value = 'invalid-email'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(host.querySelector<HTMLButtonElement>('.add-contact button[type=submit]')!.disabled).toBe(true);
    expect(host.querySelector('.error-text')).toBeTruthy();
    input.value = 'friend@example.invalid'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    host.querySelector<HTMLButtonElement>('.add-contact button[type=submit]')!.click();
    await fixture.whenStable();
    expect(api.request).toHaveBeenCalledWith('friend@example.invalid');
    expect(host.querySelector('#friend-email')).toBeNull();
    expect(fixture.componentInstance.tab()).toBe('requests');
  });
  it('shows the share code and submits a valid friend code without an email', async () => {
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    fixture.componentInstance.toggleAddContact();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.my-friend-code code')?.textContent).toBe('WF-A1B2-C3D4-E5F6');
    const input = host.querySelector<HTMLInputElement>('#friend-email')!;
    input.value = 'wf-1234-abcd-5678'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    const submit = host.querySelector<HTMLButtonElement>('.add-contact button[type=submit]')!;
    expect(submit.disabled).toBe(false); submit.click();
    await fixture.whenStable();
    expect(api.requestCode).toHaveBeenCalledWith('wf-1234-abcd-5678');
    expect(api.request).not.toHaveBeenCalled();
  });
  it('searches names without Vietnamese accents in conversations and requests', async () => {
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    fixture.componentInstance.search.set('nguoi ban');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.conversation')).toHaveLength(1);
    fixture.componentInstance.tab.set('requests'); fixture.detectChanges();
    expect(host.querySelectorAll('.person')).toHaveLength(1);
    fixture.componentInstance.search.set('khong tim thay'); fixture.detectChanges();
    expect(host.querySelectorAll('.person')).toHaveLength(0);
  });
  it('keeps Android keyboard Enter as a newline and sends only with the Send button', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    await TestBed.inject(SocialStore).select('peer-a');
    await fixture.whenStable();
    const store = TestBed.inject(SocialStore);
    store.setDraft('A message being composed');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(api.send).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Enter xuống dòng');
  });
  it('clears the composer after a successful send through the input and submit controls', async () => {
    api.send.mockImplementation(async (peer, clientId, body) => ({ id: 'sent-ui', senderId: 'me', recipientId: peer, clientId, body, createdAt: '2026-11-02T04:00:00Z', readAt: null }));
    const fixture = TestBed.createComponent(ContactsPage);
    await fixture.whenStable();
    await TestBed.inject(SocialStore).select('peer-a'); await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
    input.value = 'Hello through the UI'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    host.querySelector<HTMLButtonElement>('.composer button[type=submit]')!.click();
    await fixture.whenStable();
    expect(api.send).toHaveBeenCalledOnce();
    expect(TestBed.inject(SocialStore).draft()).toBe('');
    expect(input.value).toBe('');
    expect(host.querySelector<HTMLButtonElement>('.composer button[type=submit]')!.disabled).toBe(true);
  });
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
