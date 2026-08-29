import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../theme-service';

@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="theme-toggle-btn"
      [attr.aria-label]="
        themeService.resolvedTheme() === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'
      "
      [attr.aria-pressed]="themeService.resolvedTheme() === 'dark'"
      (click)="themeService.toggle()"
    >
      @if (themeService.resolvedTheme() === 'dark') {
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12ZM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          />
        </svg>
      } @else {
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M20.742 13.045a8.088 8.088 0 0 1-2.077.271c-4.492 0-8.131-3.639-8.131-8.131 0-1.401.354-2.72.977-3.871a10.096 10.096 0 1 0 9.231 11.732Z"
          />
        </svg>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .theme-toggle-btn {
      border: none;
      background: none;
      color: var(--color-text-tertiary);
      border-radius: 50%;
      width: 2.25rem;
      height: 2.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    .theme-toggle-btn:hover {
      background: var(--color-surface-hover);
    }

    .theme-toggle-btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 1px;
    }
  `,
})
export class ThemeToggle {
  protected readonly themeService = inject(ThemeService);
}
