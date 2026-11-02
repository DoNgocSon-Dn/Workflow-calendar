import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../auth/auth-store';
import { TranslationService } from '../i18n/translation.service';
import { SocialStore } from '../../features/social/social.store';
import { Icon } from '../../shared/components/icon/icon';
import { isAndroidApp } from './mobile-platform';

export function hasMobileTabs(url: string): boolean {
  return /^\/(calendar|tasks|contacts)\/?$/.test(url.split(/[?#]/)[0]);
}

@Component({
  selector: 'app-mobile-navigation',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (visible()) {
    <nav class="mobile-navigation" [attr.aria-label]="i18n.t('social.navigation')">
      <a routerLink="/calendar" routerLinkActive="active" ariaCurrentWhenActive="page">
        <span class="tab-icon"><app-icon name="calendar" /></span>
        <span>{{ i18n.t('tasks.calendar') }}</span>
      </a>
      <a routerLink="/tasks" routerLinkActive="active" ariaCurrentWhenActive="page">
        <span class="tab-icon"><app-icon name="check-square" /></span>
        <span>{{ i18n.t('mobile.tasks') }}</span>
      </a>
      <a routerLink="/contacts" routerLinkActive="active" ariaCurrentWhenActive="page">
        <span class="tab-icon"><app-icon name="message" />
          @if (social.badge()) {
            <b class="tab-badge" [attr.aria-label]="i18n.t('mobile.contactUpdates', { messages: social.unreadCount(), requests: social.overview().incoming.length })">{{ social.badge() > 99 ? '99+' : social.badge() }}</b>
          }
        </span>
        <span>{{ i18n.t('social.title') }}</span>
      </a>
    </nav>
  }`,
  styles: `:host { display: contents; }
    .mobile-navigation { position: fixed; inset: auto 0 0; z-index: 125; height: 68px;
      display: grid; grid-template-columns: repeat(3, 1fr); box-sizing: border-box;
      padding: 6px max(12px, env(safe-area-inset-right)) 4px max(12px, env(safe-area-inset-left));
      border-top: 1px solid var(--color-border); background: var(--color-surface); }
    a { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 3px;
      min-width: 0; min-height: 48px; color: var(--color-text-tertiary); text-decoration: none;
      font-size: 11px; font-weight: 600; border-radius: 12px; -webkit-tap-highlight-color: transparent; }
    .tab-icon { position: relative; display: flex; align-items: center; justify-content: center;
      width: 56px; height: 30px; border-radius: 16px; font-size: 23px; }
    .active { color: var(--holiday-accent); }
    .active .tab-icon { background: var(--holiday-accent-soft); }
    a:active { background: var(--color-surface-hover); }
    a:focus-visible { outline: 2px solid var(--holiday-accent); outline-offset: -3px; }
    .tab-badge { position: absolute; top: -2px; right: 0; min-width: 16px; padding: 1px 4px;
      border-radius: 10px; background: var(--color-danger); color: white; font-size: 10px; line-height: 16px; }
    :host-context(.workflow-keyboard-open) .mobile-navigation { display: none; }`,
})
export class MobileNavigation {
  protected readonly i18n = inject(TranslationService);
  protected readonly social = inject(SocialStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);
  readonly visible = computed(() => isAndroidApp() && !!this.auth.user() && hasMobileTabs(this.url()));

  constructor() {
    const destroy = inject(DestroyRef);
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.url.set(event.urlAfterRedirects);
    });
    effect(() => document.documentElement.classList.toggle('mobile-tab-layout', this.visible()));
    destroy.onDestroy(() => {
      subscription.unsubscribe();
      document.documentElement.classList.remove('mobile-tab-layout');
    });
  }
}
