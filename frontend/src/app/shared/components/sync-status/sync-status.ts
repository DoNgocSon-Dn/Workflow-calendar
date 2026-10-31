import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalendarStore } from '../../../features/calendar/data/calendar-store';
import { TranslationService } from '../../../core/i18n/translation.service';

@Component({
  selector: 'app-sync-status',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.syncing() || store.showingCached() || store.syncFailed()) {
    <div class="sync-status" role="status">
      @if (store.syncing()) {
        <span class="sync-dot" aria-hidden="true"></span>
      }
      <span
        >{{
          i18n.t(
            store.syncFailed()
              ? store.showingCached()
                ? 'startup.offlineCached'
                : 'startup.failed'
              : store.showingCached()
                ? 'startup.cached'
                : 'startup.firstLoad'
          )
        }}
        @if (store.lastSyncedAt()) {
          <small>
            · {{ i18n.t('startup.lastSync') }}
            {{ store.lastSyncedAt() | date: 'dd/MM HH:mm' }}</small
          >
        }
      </span>
      @if (!store.syncing()) {
        <button type="button" (click)="store.loadAll()">{{ i18n.t('startup.retry') }}</button>
      }
    </div>
  }`,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
    .sync-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px 14px;
      font-size: 11px;
      line-height: 1.6;
      color: var(--color-text-secondary);
      background: var(--color-accent-soft);
      border-bottom: 1px solid var(--color-border);
    }
    small {
      font-size: inherit;
    }
    .sync-dot {
      width: 7px;
      height: 7px;
      flex-shrink: 0;
      background: #2563eb;
      border-radius: 50%;
      animation: sync-pulse 1.5s ease-in-out infinite;
    }
    button {
      border: 0;
      border-radius: 6px;
      background: #2563eb;
      color: white;
      padding: 5px 9px;
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    @keyframes sync-pulse {
      50% {
        opacity: 0.3;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sync-dot {
        animation: none;
      }
    }
  `,
})
export class SyncStatus {
  readonly store = inject(CalendarStore);
  readonly i18n = inject(TranslationService);
}
