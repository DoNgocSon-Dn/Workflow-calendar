import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../core/auth/auth-store';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { SocialApi } from './social-api.service';
import { DirectMessage, SocialOverview, emptyOverview } from './social.models';

function mergeMessages(...pages: DirectMessage[][]): DirectMessage[] {
  const messages = new Map<string, DirectMessage>();
  for (const page of pages)
    for (const message of page) {
      const old = messages.get(message.id);
      messages.set(
        message.id,
        old?.readAt && !message.readAt ? { ...message, readAt: old.readAt } : message,
      );
    }
  return [...messages.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

@Injectable({ providedIn: 'root' })
export class SocialStore {
  private readonly api = inject(SocialApi);
  private readonly auth = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);
  private readonly notifications = inject(NotificationService);
  private readonly i18n = inject(TranslationService);
  private readonly account = signal<string | null>(null);
  private get owner(): string | null {
    return this.account();
  }
  private set owner(value: string | null) {
    this.account.set(value);
  }
  private generation = 0;
  private refreshVersion = 0;
  private selectionVersion = 0;
  private readonly overviewState = signal<SocialOverview>(emptyOverview());
  private readonly messageState = signal<DirectMessage[]>([]);
  private readonly peerState = signal<string | null>(null);
  private readonly draftState = signal<Record<string, { body: string; clientId: string }>>({});
  private readonly errorState = signal<string | null>(null);
  private readonly busyState = signal(false);
  private readonly sendingState = signal(false);
  private readonly loadingState = signal(false);
  private readonly hasMoreState = signal(false);
  private visiblePeer: string | null = null;
  private reading = false;
  private readonly isOwner = computed(
    () => !!this.auth.user()?.id && this.auth.user()?.id === this.owner,
  );
  readonly overview = computed(() => (this.isOwner() ? this.overviewState() : emptyOverview()));
  readonly messages = computed(() => (this.isOwner() ? this.messageState() : []));
  readonly peer = computed(() => (this.isOwner() ? this.peerState() : null));
  readonly selected = computed(
    () => this.overview().conversations.find((c) => c.profile.id === this.peer()) ?? null,
  );
  readonly unreadCount = computed(() =>
    this.overview().conversations.reduce((sum, c) => sum + c.unreadCount, 0),
  );
  readonly badge = computed(() => this.unreadCount() + this.overview().incoming.length);
  readonly draft = computed(() =>
    this.peer() ? (this.draftState()[this.peer()!]?.body ?? '') : '',
  );
  readonly error = computed(() => (this.isOwner() ? this.errorState() : null));
  readonly busy = this.busyState.asReadonly();
  readonly sending = this.sendingState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly connected = this.realtime.connected;

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => {
        if (userId === this.owner) return;
        this.owner = userId;
        this.generation++;
        this.selectionVersion++;
        this.refreshVersion++;
        this.overviewState.set(emptyOverview());
        this.messageState.set([]);
        this.peerState.set(null);
        this.draftState.set({});
        this.errorState.set(null);
        this.busyState.set(false);
        this.loadingState.set(false);
        this.sendingState.set(false);
        this.hasMoreState.set(false);
        this.visiblePeer = null;
        this.reading = false;
        if (userId) void this.refresh();
      });
    });
    this.realtime.on('social:changed', () => {
      void this.refresh();
    });
    this.realtime.on<DirectMessage>('direct:message', (message) => this.receive(message));
    this.realtime.on<{ readerId: string; messageIds: string[] }>('direct:read', (payload) => {
      const me = this.auth.user()?.id;
      if (!this.active() || !Array.isArray(payload.messageIds)) return;
      const ids = new Set(payload.messageIds);
      this.messageState.update((list) =>
        list.map((m) =>
          m.senderId === me && m.recipientId === payload.readerId && ids.has(m.id)
            ? { ...m, readAt: m.readAt ?? new Date().toISOString() }
            : m,
        ),
      );
    });
    this.realtime.onConnect(() => {
      void this.refresh();
      const peer = this.peer();
      if (peer) void this.select(peer);
    });
  }

  private active(generation = this.generation): boolean {
    return generation === this.generation && !!this.owner && this.auth.user()?.id === this.owner;
  }
  private fail(error: unknown): void {
    let key = 'social.error';
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) key = 'social.notFound';
      else if (error.status === 403) key = 'social.forbidden';
      else if (error.status === 429) key = 'social.rateLimit';
      else if (error.status === 503 || error.status === 0) key = 'social.unavailable';
    }
    this.errorState.set(this.i18n.t(key));
  }
  async refresh(): Promise<void> {
    if (!this.active()) return;
    const generation = this.generation,
      version = ++this.refreshVersion;
    try {
      const data = await this.api.overview();
      if (!this.active(generation) || version !== this.refreshVersion) return;
      this.overviewState.set(data);
      this.errorState.set(null);
      // Recover the latest unread alert after a socket disconnect. The
      // notification center deduplicates by the stable database message ID.
      for (const conversation of data.conversations) {
        const last = conversation.lastMessage;
        if (
          conversation.unreadCount > 0 &&
          last?.recipientId === this.owner &&
          !last.readAt &&
          (this.visiblePeer !== conversation.profile.id || this.peer() !== conversation.profile.id)
        ) {
          this.notifications.ingest({
            id: `direct-${last.id}`,
            type: 'message',
            title: conversation.profile.name,
            message: last.body,
            createdAt: last.createdAt,
            metadata: { directPeerId: conversation.profile.id },
            sender: { name: conversation.profile.name, email: conversation.profile.email },
          });
        }
      }
    } catch (error) {
      if (this.active(generation) && version === this.refreshVersion) this.fail(error);
    }
  }
  async select(peer: string): Promise<void> {
    if (!this.active()) return;
    const generation = this.generation,
      version = ++this.selectionVersion;
    const samePeer = this.peerState() === peer;
    this.peerState.set(peer);
    this.hasMoreState.set(false);
    this.errorState.set(null);
    if (!samePeer) this.messageState.set([]);
    this.loadingState.set(true);
    try {
      const page = await this.api.messages(peer);
      if (!this.active(generation) || version !== this.selectionVersion) return;
      this.messageState.set(mergeMessages(page.messages, this.messageState()));
      this.hasMoreState.set(page.hasMore);
      void this.markVisibleRead();
    } catch (error) {
      if (this.active(generation) && version === this.selectionVersion) this.fail(error);
    } finally {
      if (this.active(generation) && version === this.selectionVersion)
        this.loadingState.set(false);
    }
  }
  close(): void {
    this.selectionVersion++;
    this.peerState.set(null);
    this.messageState.set([]);
    this.loadingState.set(false);
    this.visiblePeer = null;
  }
  async older(): Promise<void> {
    const peer = this.peer(),
      first = this.messages()[0];
    if (!peer || !first || this.loading() || !this.hasMore()) return;
    const generation = this.generation,
      version = this.selectionVersion;
    this.loadingState.set(true);
    try {
      const page = await this.api.messages(peer, first.id);
      if (!this.active(generation) || version !== this.selectionVersion) return;
      this.messageState.set(mergeMessages(page.messages, this.messageState()));
      this.hasMoreState.set(page.hasMore);
      void this.markVisibleRead();
    } catch (error) {
      if (this.active(generation) && version === this.selectionVersion) this.fail(error);
    } finally {
      if (this.active(generation) && version === this.selectionVersion)
        this.loadingState.set(false);
    }
  }
  setDraft(body: string): void {
    const peer = this.peer();
    if (!peer || !this.active()) return;
    const limited = body.slice(0, 4000);
    if (this.draftState()[peer]?.body === limited) return;
    this.draftState.update((drafts) => ({
      ...drafts,
      [peer]: { body: limited, clientId: crypto.randomUUID() },
    }));
  }
  async send(): Promise<void> {
    const peer = this.peer(),
      draft = peer ? this.draftState()[peer] : null;
    if (
      !this.active() ||
      !peer ||
      !draft?.body.trim() ||
      !this.selected()?.canMessage ||
      this.sending()
    )
      return;
    const generation = this.generation;
    this.sendingState.set(true);
    this.errorState.set(null);
    try {
      const message = await this.api.send(peer, draft.clientId, draft.body.trim());
      if (!this.active(generation)) return;
      if (this.peer() === peer) this.messageState.update((list) => mergeMessages(list, [message]));
      // Never erase a newer draft or a different conversation's text.
      if (this.draftState()[peer]?.clientId === draft.clientId)
        this.draftState.update((drafts) => ({
          ...drafts,
          [peer]: { body: '', clientId: crypto.randomUUID() },
        }));
      void this.refresh();
    } catch (error) {
      if (this.active(generation)) this.fail(error);
    } finally {
      if (this.active(generation)) this.sendingState.set(false);
    }
  }
  async request(email: string): Promise<boolean> {
    return this.mutate(() => this.api.request(email.trim()));
  }
  async action(id: string, action: 'accept' | 'decline' | 'cancel' | 'remove'): Promise<boolean> {
    return this.mutate(() => this.api.action(id, action));
  }
  async block(peer: string, blocked: boolean): Promise<boolean> {
    return this.mutate(() => this.api.block(peer, blocked));
  }
  private async mutate(action: () => Promise<unknown>): Promise<boolean> {
    if (!this.active() || this.busy()) return false;
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      await action();
      if (!this.active(generation)) return false;
      await this.refresh();
      return true;
    } catch (error) {
      if (this.active(generation)) this.fail(error);
      return false;
    } finally {
      if (this.active(generation)) this.busyState.set(false);
    }
  }
  setVisible(peer: string | null): void {
    this.visiblePeer = peer;
    void this.markVisibleRead();
  }
  private async markVisibleRead(): Promise<void> {
    const peer = this.peer();
    if (!this.active() || this.reading || !peer || peer !== this.visiblePeer) return;
    const ids = this.messages()
      .filter((m) => m.senderId === peer && m.recipientId === this.owner && !m.readAt)
      .map((m) => m.id)
      .slice(0, 100);
    if (!ids.length) return;
    const generation = this.generation,
      selection = this.selectionVersion;
    this.reading = true;
    let succeeded = false;
    try {
      const result = await this.api.read(ids);
      if (!this.active(generation)) return;
      succeeded = result.messageIds.length > 0;
      if (selection === this.selectionVersion) {
        const read = new Set(result.messageIds);
        this.messageState.update((list) =>
          list.map((m) => (read.has(m.id) ? { ...m, readAt: new Date().toISOString() } : m)),
        );
        for (const id of result.messageIds) this.notifications.markAsRead(`direct-${id}`);
      }
      void this.refresh();
    } catch {
      /* A failed receipt stays unread and can be retried on focus/refresh. */
    } finally {
      if (this.active(generation)) {
        this.reading = false;
        if (succeeded && selection === this.selectionVersion) void this.markVisibleRead();
      }
    }
  }
  private receive(message: DirectMessage): void {
    if (!this.active() || (message.senderId !== this.owner && message.recipientId !== this.owner))
      return;
    const peer = message.senderId === this.owner ? message.recipientId : message.senderId;
    if (this.peer() === peer) {
      this.messageState.update((list) => mergeMessages(list, [message]));
      void this.markVisibleRead();
    }
    if (message.recipientId === this.owner && (this.visiblePeer !== peer || this.peer() !== peer)) {
      const profile = this.overview().conversations.find((c) => c.profile.id === peer)?.profile;
      this.notifications.ingest({
        id: `direct-${message.id}`,
        type: 'message',
        title: profile?.name ?? this.i18n.t('social.newMessage'),
        message: message.body,
        createdAt: message.createdAt,
        metadata: { directPeerId: peer },
        sender: profile ? { name: profile.name, email: profile.email } : undefined,
      });
    }
    void this.refresh();
  }
}
