import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { TranslationService } from '../../core/i18n/translation.service';
import { DialogService } from '../../core/services/dialog.service';
import { DesktopNavigationService } from '../../core/desktop/desktop-navigation.service';
import { SocialStore } from './social.store';
import { BrandLogo } from '../../shared/components/brand-logo/brand-logo';
import { HolidayBanner } from '../../shared/components/holiday-banner/holiday-banner';

@Component({
  selector: 'app-contacts-page',
  imports: [RouterLink, FormsModule, DatePipe, BrandLogo, HolidayBanner],
  templateUrl: './contacts-page.html',
  styleUrl: './contacts-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactsPage {
  readonly store = inject(SocialStore);
  readonly i18n = inject(TranslationService);
  readonly auth = inject(AuthStore);
  private readonly dialog = inject(DialogService);
  private readonly navigation = inject(DesktopNavigationService);
  private readonly route = inject(ActivatedRoute);
  readonly tab = signal<'messages' | 'friends' | 'requests'>('messages');
  readonly email = signal('');
  readonly search = signal('');
  readonly notice = signal('');
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private atBottom = true;
  private lastTail: string | null = null;
  private requestedPeer: string | null = this.route.snapshot.queryParamMap.get('peer');
  private selectedRequest: string | null = null;
  readonly conversations = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.store
      .overview()
      .conversations.filter(
        (c) => !query || `${c.profile.name} ${c.profile.email}`.toLocaleLowerCase().includes(query),
      );
  });

  constructor() {
    effect(() => {
      const alert = this.navigation.pending();
      const conversations = this.store.overview().conversations;
      const requestedPeer = alert?.peerId ?? this.requestedPeer;
      if (!requestedPeer || !conversations.some((c) => c.profile.id === requestedPeer)) return;
      untracked(() => {
        if (this.selectedRequest !== (alert?.id ?? requestedPeer)) {
          this.selectedRequest = alert?.id ?? requestedPeer;
          this.open(requestedPeer);
        }
        if (
          alert?.peerId &&
          this.store.peer() === requestedPeer &&
          !this.store.loading() &&
          !this.store.error()
        )
          this.navigation.complete(alert.id);
        this.requestedPeer = null;
      });
    });
    // Track completion separately: the initial thread load is asynchronous.
    effect(() => {
      const alert = this.navigation.pending(),
        peer = this.store.peer(),
        loading = this.store.loading(),
        error = this.store.error();
      if (alert?.peerId === peer && !loading && !error)
        untracked(() => this.navigation.complete(alert!.id));
    });
    const sync = () => this.syncVisible();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      this.store.setVisible(null);
    });
    afterRenderEffect(() => {
      const messages = this.store.messages();
      const el = this.thread()?.nativeElement;
      const tail = messages.at(-1)?.id ?? null;
      if (el && this.atBottom && tail !== this.lastTail) el.scrollTop = el.scrollHeight;
      this.lastTail = tail;
      this.syncVisible();
    });
  }
  private syncVisible(): void {
    this.store.setVisible(
      document.visibilityState === 'visible' && document.hasFocus() && this.atBottom
        ? this.store.peer()
        : null,
    );
  }
  onScroll(): void {
    const el = this.thread()?.nativeElement;
    if (el) this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    this.syncVisible();
  }
  open(peer: string): void {
    this.tab.set('messages');
    this.atBottom = true;
    this.lastTail = null;
    void this.store.select(peer);
  }
  async add(): Promise<void> {
    this.notice.set('');
    if (await this.store.request(this.email())) {
      this.email.set('');
      this.notice.set(this.i18n.t('social.requestSent'));
    }
  }
  async remove(id: string): Promise<void> {
    if (await this.dialog.confirm(this.i18n.t('social.removeConfirm'), { danger: true }))
      await this.store.action(id, 'remove');
  }
  async block(): Promise<void> {
    const selected = this.store.selected();
    if (!selected) return;
    if (
      selected.blockedByMe ||
      (await this.dialog.confirm(this.i18n.t('social.blockConfirm'), { danger: true }))
    ) {
      await this.store.block(selected.profile.id, !selected.blockedByMe);
    }
  }
  async blockRequest(peer: string): Promise<void> {
    if (await this.dialog.confirm(this.i18n.t('social.blockConfirm'), { danger: true }))
      await this.store.block(peer, true);
  }
  keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.store.send();
    }
  }
  async older(): Promise<void> {
    const el = this.thread()?.nativeElement;
    const height = el?.scrollHeight ?? 0,
      top = el?.scrollTop ?? 0;
    this.atBottom = false;
    this.store.setVisible(null);
    await this.store.older();
    // Keep the reader's position rather than jumping to the newest message.
    requestAnimationFrame(() => {
      if (el?.isConnected) el.scrollTop = top + el.scrollHeight - height;
    });
  }
}
