import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : null;
}

function systemPrefersDark(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  );
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  /**
   * Chế độ người dùng chọn: 'light'/'dark' cố định, hoặc 'system' = đi theo cài
   * đặt sáng/tối của THIẾT BỊ và tự đổi ngay khi thiết bị đổi.
   *
   * Mặc định 'system' — mở app là khớp máy luôn.
   */
  readonly theme = signal<Theme>(readStoredTheme() ?? 'system');

  private readonly systemDark = signal(systemPrefersDark());

  /** Bề mặt sáng/tối thật sự đang áp dụng (đã quy đổi 'system'). */
  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const t = this.theme();
    return t === 'system' ? (this.systemDark() ? 'dark' : 'light') : t;
  });

  constructor() {
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) =>
        this.systemDark.set(e.matches),
      );
    }

    effect(() => {
      const resolved = this.resolvedTheme();
      // App lịch dùng class `.dark` (xem styles.css). KHÔNG đụng `data-theme` —
      // đó là hệ riêng của trang landing/login, hai bên ghi đè nhau.
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#0f1117' : '#ffffff');
      localStorage.setItem(STORAGE_KEY, this.theme());
    });
  }

  /** Nút mặt trời/mặt trăng: lật NGƯỢC bề mặt đang thấy, chuyển sang chế độ cố
   *  định. Muốn về "theo máy" thì vào Cài đặt. */
  toggle(): void {
    this.theme.set(this.resolvedTheme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }
}
