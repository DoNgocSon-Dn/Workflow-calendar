import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';

/** Thời gian giữ vòng xoay trước khi mở màn (ms). */
const SPIN_HOLD_MS = 1500;
/** Thời lượng của hiệu ứng iris thu nhỏ, khớp với transition trong CSS. */
const IRIS_EXIT_MS = 900;
const PARTICLE_COUNT = 14;
const THEME_STORAGE_KEY = 'workflow-theme';

interface AmbientParticle {
  size: number;
  left: number;
  top: number;
  duration: number;
  delay: number;
}

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandLogo],
})
export class LoginPage implements OnInit, AfterViewInit {
  private readonly authStore = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');
  private readonly preloader = viewChild.required<ElementRef<HTMLElement>>('preloader');

  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  /** Hạt sáng nổi trong nền — thuần trang trí, dựng một lần rồi để CSS lo. */
  protected readonly particles: AmbientParticle[] = this.prefersReducedMotion()
    ? []
    : Array.from({ length: PARTICLE_COUNT }, () => ({
        size: 2 + Math.random() * 3,
        left: Math.random() * 100,
        top: 30 + Math.random() * 55,
        duration: 6 + Math.random() * 6,
        delay: Math.random() * 6,
      }));

  readonly submitting = signal(false);
  readonly revealed = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(this.route.snapshot.queryParamMap.get('message'));

  ngOnInit(): void {
    // Chủ đề dùng chung với trang landing nên hai trang không nhấp nháy khi
    // chuyển qua lại.
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) ?? 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  ngAfterViewInit(): void {
    this.page().nativeElement.setAttribute(
      'data-theme',
      localStorage.getItem(THEME_STORAGE_KEY) ?? 'dark',
    );
    this.runPreloader();
    this.destroyRef.onDestroy(() => {
      for (const timer of this.timers) {
        clearTimeout(timer);
      }
    });
  }

  toggleTheme(event: MouseEvent): void {
    const button = event.currentTarget as HTMLElement;
    const root = document.documentElement;
    const container = this.page().nativeElement;

    const current = container.getAttribute('data-theme') ?? root.getAttribute('data-theme') ?? 'dark';
    const next = current === 'light' ? 'dark' : 'light';

    // Hiệu ứng loang tròn bắt đầu từ chính nút bấm.
    const rect = button.getBoundingClientRect();
    root.style.setProperty('--tx', `${((rect.left + rect.width / 2) / window.innerWidth) * 100}%`);
    root.style.setProperty('--ty', `${((rect.top + rect.height / 2) / window.innerHeight) * 100}%`);

    const applyTheme = (): void => {
      root.setAttribute('data-theme', next);
      container.setAttribute('data-theme', next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
    };

    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    }).startViewTransition;

    if (startViewTransition && !this.prefersReducedMotion()) {
      startViewTransition.call(document, applyTheme);
    } else {
      applyTheme();
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    this.submitting.set(true);
    try {
      const error = await this.authStore.signInWithGoogle();
      if (error) {
        this.errorMessage.set(
          error.message.includes('provider') || error.message.includes('disabled')
            ? 'Đăng nhập Google chưa được kích hoạt trong Supabase Dashboard. Vui lòng thêm Google Client ID & Secret.'
            : error.message,
        );
        this.submitting.set(false);
      }
      // Khi thành công Supabase điều hướng sang Google, nên giữ nguyên trạng
      // thái "đang chuyển hướng" cho tới lúc trang bị thay thế.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chưa cấu hình Google Credentials';
      this.errorMessage.set(`Lỗi đăng nhập Google: ${message}`);
      this.submitting.set(false);
    }
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Vòng xoay giữ nhịp rồi thu nhỏ kiểu iris để lộ thẻ đăng nhập. */
  private runPreloader(): void {
    const preloader = this.preloader().nativeElement;

    if (this.prefersReducedMotion()) {
      preloader.style.display = 'none';
      this.revealed.set(true);
      return;
    }

    this.timers.push(
      setTimeout(() => {
        preloader.classList.add('exit');
        this.revealed.set(true);
        this.timers.push(
          setTimeout(() => {
            preloader.style.display = 'none';
          }, IRIS_EXIT_MS),
        );
      }, SPIN_HOLD_MS),
    );
  }
}
