import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/i18n/translation.service';
import { SocialStore } from './social.store';

@Component({
  selector: 'app-contacts-link',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a
    routerLink="/contacts"
    [attr.aria-label]="i18n.t('social.title') + (store.badge() ? ' (' + store.badge() + ')' : '')"
    [title]="i18n.t('social.title')"
    ><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 3h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-6 4V5a2 2 0 0 1 2-2Zm0 2v14l3.4-2H20V5H4Zm3 3h10v2H7V8Zm0 4h7v2H7v-2Z"
      />
    </svg>
    @if (store.badge()) {
      <b>{{ store.badge() > 99 ? '99+' : store.badge() }}</b>
    }
  </a>`,
  styles: `
    :host {
      display: inline-flex;
    }
    a {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      color: var(--color-text-secondary);
    }
    a:hover {
      background: var(--color-accent-soft);
      color: #2563eb;
    }
    b {
      position: absolute;
      top: 0;
      right: -2px;
      background: #2563eb;
      color: white;
      border-radius: 20px;
      font: 700 9px/1.6 system-ui;
      padding: 0 4px;
    }
  `,
})
export class ContactsLink {
  readonly store = inject(SocialStore);
  readonly i18n = inject(TranslationService);
}
