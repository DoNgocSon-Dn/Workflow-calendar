import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'users'
  | 'user'
  | 'check-square'
  | 'message'
  | 'calendar'
  | 'eye'
  | 'eye-off'
  | 'pencil'
  | 'trash'
  | 'paperclip'
  | 'check'
  | 'close'
  | 'plus'
  | 'arrow-left'
  | 'arrow-right'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'star';

/**
 * Bộ icon nét mảnh dùng chung, thay cho emoji trong UI.
 *
 * Emoji được font hệ điều hành vẽ nên mỗi máy một kiểu, luôn nhiều màu và
 * không theo được màu chữ xung quanh. Ở đây dùng `stroke="currentColor"` để
 * icon thừa hưởng màu của nút chứa nó — kể cả trạng thái hover/disabled — và
 * `1em` để icon lớn/nhỏ theo cỡ chữ tại chỗ đặt.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    svg {
      width: 1em;
      height: 1em;
      display: block;
    }
  `,
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.fill]="filled() ? 'currentColor' : 'none'"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('users') {
          <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
          <circle cx="9" cy="7" r="3.25" />
          <path d="M22 20v-1.5a4 4 0 0 0-3-3.87" />
          <path d="M16 4.13a4 4 0 0 1 0 7.75" />
        }
        @case ('user') {
          <path d="M19 20v-1.5a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20" />
          <circle cx="12" cy="7" r="3.5" />
        }
        @case ('check-square') {
          <path d="M20 12v6a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V6.5A2.5 2.5 0 0 1 6.5 4H15" />
          <path d="M9 11.5 12 14.5 21 5.5" />
        }
        @case ('message') {
          <path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.3-4.6a7.5 7.5 0 1 1 15.2-3.4z" />
        }
        @case ('calendar') {
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
        }
        @case ('eye') {
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('eye-off') {
          <path d="M9.9 5.8A9.3 9.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1" />
          <path d="M6.4 7.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.7-.8" />
          <path d="M10 10a3 3 0 0 0 4.2 4.2" />
          <path d="M3.5 3.5 20.5 20.5" />
        }
        @case ('pencil') {
          <path d="M16.5 3.9a2.3 2.3 0 0 1 3.3 3.3L8 19l-4.5 1.5L5 16z" />
          <path d="M14.5 5.9 18 9.4" />
        }
        @case ('trash') {
          <path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
          <path d="M6.5 6.5 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.5" />
          <path d="M10.5 10.5v6M13.5 10.5v6" />
        }
        @case ('paperclip') {
          <path
            d="M20 11.5 12.3 19.2a4.6 4.6 0 0 1-6.5-6.5l7.9-7.9a3.1 3.1 0 0 1 4.3 4.3l-7.9 7.9a1.5 1.5 0 0 1-2.2-2.2l7.3-7.2"
          />
        }
        @case ('check') {
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        }
        @case ('close') {
          <path d="M6 6 18 18M18 6 6 18" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('arrow-left') {
          <path d="M19 12H5M11 6l-6 6 6 6" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14M13 6l6 6-6 6" />
        }
        @case ('chevron-right') {
          <path d="M9.5 5.5 16 12l-6.5 6.5" />
        }
        @case ('chevron-left') {
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        }
        @case ('chevron-down') {
          <path d="M5.5 9.5 12 16l6.5-6.5" />
        }
        @case ('star') {
          <path d="M12 2.5 15.1 8.8l6.9 1-5 4.9L18.3 21.5 12 18.1l-6.3 3.4 1.2-6.8-5-4.9 6.9-1z" />
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly strokeWidth = input(1.75);
  /** Ngôi sao đã gắn dấu vẽ đặc ruột thay vì chỉ viền — các icon khác không
   *  cần input này. */
  readonly filled = input(false);
}
