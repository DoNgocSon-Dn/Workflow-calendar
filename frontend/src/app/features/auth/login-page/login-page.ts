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
import { gsap } from 'gsap';
import { AuthStore } from '../../../core/auth/auth-store';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';

/** Thời gian giữ vòng xoay trước khi mở màn (ms). */
const SPIN_HOLD_MS = 1500;
/** Thời lượng của hiệu ứng iris thu nhỏ, khớp với transition trong CSS. */
const IRIS_EXIT_MS = 900;
const PARTICLE_COUNT = 14;
const THEME_STORAGE_KEY = 'workflow-theme';
/** Cùng đường cong với landing: vào mềm, tăng tốc, hãm chậm, không nảy. */
const CINEMATIC_EASE = 'cubic-bezier(0.22, 0.61, 0.24, 1)';
/** Rời cảnh thì tăng tốc dần rồi đi luôn — không hãm lại ở cuối như lúc vào. */
const DEPARTURE_EASE = 'cubic-bezier(0.45, 0, 0.7, 0.35)';

/** Mọi thứ animation có ghi inline style lên. Gom lại một chỗ để lúc khôi
 *  phục còn biết đường xoá cho đúng và cho đủ. */
const ANIMATED_SELECTORS =
  '.auth-card, .auth-card .sub, .auth-card h1, .auth-kicker,' +
  ' .btn-oauth, .login-nav, .auth-halo, .orb, .orb--offset, .orbit-motif,' +
  ' .grid-ring, .particle, .card-ignition';

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
  /** Giữ timeline rời cảnh để huỷ được nếu OAuth lỗi giữa chừng. */
  private departureTl: gsap.core.Timeline | null = null;
  /** Parallax chỉ được gắn một lần, kể cả khi cảnh được dựng lại. */
  private parallaxBound = false;

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

    // Bấm Back từ Google: trình duyệt khôi phục trang từ bfcache KÈM NGUYÊN
    // inline style của animation rời cảnh, nên thẻ đăng nhập bị opacity 0 và
    // người dùng thấy trang trống. Component không bị dựng lại nên không có
    // vòng đời Angular nào bắt được — phải nghe pageshow.
    // KHÔNG lọc theo event.persisted: quay lại từ Google có thể là bfcache
    // restore, có thể là tải lại thường, tuỳ trình duyệt và header cache. Thay
    // vì đoán cơ chế, cứ thấy cảnh còn kẹt ở trạng thái "đã rời đi" thì dựng
    // lại — điều kiện này đúng cho mọi đường quay về.
    const onReturn = (): void => {
      if (this.page().nativeElement.classList.contains('is-departing')) {
        this.restoreAfterBack();
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') onReturn();
    };
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisible);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onVisible);
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
    // Chặn bấm nhiều lần: mỗi lần bấm là một request OAuth, và giữa animation
    // thì nút vẫn nằm đó cho tới lúc trang bị thay thế.
    if (this.submitting()) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    // Chuyển cảnh chạy TRƯỚC khi gọi OAuth: Supabase tự gán window.location
    // ngay trong signInWithOAuth, nên gọi trước thì trang biến mất giữa chừng
    // và animation không kịp chạy.
    await this.playDeparture();

    try {
      const error = await this.authStore.signInWithGoogle();
      if (error) {
        this.errorMessage.set(
          error.message.includes('provider') || error.message.includes('disabled')
            ? 'Đăng nhập Google chưa được kích hoạt trong Supabase Dashboard. Vui lòng thêm Google Client ID & Secret.'
            : error.message,
        );
        this.reverseDeparture();
        this.submitting.set(false);
      }
      // Khi thành công Supabase điều hướng sang Google, nên giữ nguyên trạng
      // thái "đang chuyển hướng" cho tới lúc trang bị thay thế.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chưa cấu hình Google Credentials';
      this.errorMessage.set(`Lỗi đăng nhập Google: ${message}`);
      this.reverseDeparture();
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
      this.playEntrance();
      return;
    }

    this.timers.push(
      setTimeout(() => {
        preloader.classList.add('exit');
        this.revealed.set(true);
        // Vào màn chạy NGAY khi iris bắt đầu khép, không đợi nó biến mất —
        // hai lớp chồng nhau nên không có khoảng trống ở giữa.
        this.playEntrance();
        this.timers.push(
          setTimeout(() => {
            preloader.style.display = 'none';
          }, IRIS_EXIT_MS),
        );
      }, SPIN_HOLD_MS),
    );
  }

  /**
   * Vào màn theo từng lớp: không gian trước, hình học sau, rồi thẻ tiến từ
   * chiều sâu về, cuối cùng mới tới nội dung. Cùng ngôn ngữ chuyển động với
   * landing (GSAP timeline, easing giống nhau) để hai trang là một thế giới.
   */
  private playEntrance(): void {
    const host = this.page().nativeElement;
    const reduced = this.prefersReducedMotion();
    const k = reduced ? 0.35 : 1;
    const q = (sel: string) => host.querySelector(sel);

    const tl = gsap.timeline({ defaults: { ease: CINEMATIC_EASE } });

    // Lớp 1-2: không gian và ánh sáng mở ra trước
    tl.to(q('.orbit-motif'), { opacity: 1, duration: 1.6 * k }, 0)
      .fromTo(
        q('.auth-halo'),
        { opacity: 0, scale: 0.86 },
        { opacity: 1, scale: 1, duration: 1.5 * k },
        0.1 * k,
      );

    // Lớp 3: thẻ tiến từ phía sau về đúng vị trí
    tl.fromTo(
      q('.auth-card'),
      { opacity: 0, y: 30, scale: 0.94, filter: 'blur(10px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1.05 * k },
      0.28 * k,
    );

    // Lớp 4-6: nội dung lắp vào sau khi thẻ đã đứng yên
    tl.to(
      [q('.auth-kicker'), q('.auth-card h1'), q('.auth-card .sub'), q('.btn-oauth')],
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.7 * k,
        stagger: reduced ? 0.03 : 0.09,
      },
      0.62 * k,
    );

    if (!reduced) this.initParallax();
  }

  /**
   * Chuyển cảnh rời Login — HAI PHA NGƯỢC CHIỀU.
   *
   * Bản trước chỉ đi một chiều (mọi thứ cùng giãn ra) nên đọc ra là "zoom",
   * không phải chuyển động camera. Bản này tách làm hai pha đối nghịch:
   *
   *   PHA 1 (40–190ms)  camera LÙI lại — cảnh co nhỏ, trường nhìn mở rộng.
   *                     Easing power3.out nên vận tốc GIẢM VỀ 0 ở điểm xa nhất.
   *   ĐẢO CHIỀU (~200ms) đúng lúc vận tốc bằng 0, đốm sáng ở nút bùng lên nên
   *                     không có frame nào đứng yên.
   *   PHA 2 (210–500ms) camera LAO NGƯỢC — easing power4.in khởi từ 0 rồi tăng
   *                     tốc mạnh. Chính cặp out→in này tạo cảm giác dây cung
   *                     căng rồi bật, thứ mà một tween đơn không làm được.
   *
   * OAuth nổ tại 500ms (đỉnh), đuôi animation để redirect cắt.
   */
  private playDeparture(): Promise<void> {
    const host = this.page().nativeElement;
    const q = (sel: string) => host.querySelector(sel);
    const qa = (sel: string) => host.querySelectorAll(sel);

    host.classList.add('is-departing');

    if (this.prefersReducedMotion()) {
      return new Promise((resolve) => {
        gsap.to(q('.btn-oauth'), { scale: 0.975, duration: 0.07, yoyo: true, repeat: 1 });
        gsap.to([q('.auth-card'), q('.login-nav')], {
          opacity: 0, duration: 0.16, delay: 0.06, ease: 'power2.out',
          onComplete: () => resolve(),
        });
      });
    }

    return new Promise((resolve) => {
      const tl = gsap.timeline();
      this.departureTl = tl;

      // ── Nút phản hồi tức thì ────────────────────────────────────────────
      tl.to(q('.btn-oauth'), { scale: 0.975, duration: 0.06, ease: 'power3.out' }, 0)
        .to(q('.btn-oauth'), { scale: 1, duration: 0.08, ease: 'power2.out' }, 0.06)
        .to(q('.btn-oauth'), { borderColor: 'var(--login-orbit-dot)', duration: 0.12 }, 0.05);

      // ══ PHA 1: CAMERA LÙI LẠI LẤY ĐÀ ═══════════════════════════════════
      // Cảnh co lại còn quầng sáng nở ra — hai chiều ngược nhau khiến không
      // gian đọc ra là RỘNG HƠN, chứ không phải trang bị thu nhỏ.
      tl.to(q('.auth-card'), { scale: 0.8, y: 10, duration: 0.15, ease: 'power3.out' }, 0.04)
        .to(qa('.grid-ring'), { scale: 0.86, duration: 0.15, ease: 'power3.out' }, 0.04)
        .to(q('.orbit-motif'), { scale: 0.93, duration: 0.16, ease: 'power3.out' }, 0.05)
        .to(q('.auth-halo'), { scale: 1.18, opacity: 1, duration: 0.17, ease: 'power2.out' }, 0.04)
        .to(q('.orb'), { scale: 1.12, duration: 0.17, ease: 'power2.out' }, 0.06)
        // Hạt tách xa nhau: dấu hiệu rõ nhất của việc trường nhìn đang mở.
        .to(qa('.particle'), {
          x: (_i: number, el: HTMLElement) => (el.offsetLeft - window.innerWidth / 2) * 0.12,
          y: (_i: number, el: HTMLElement) => (el.offsetTop - window.innerHeight / 2) * 0.12,
          duration: 0.16, ease: 'power2.out',
        }, 0.06)
        .to(q('.login-nav'), { opacity: 0, y: -12, duration: 0.18, ease: 'power2.in' }, 0.08);

      // ══ ĐẢO CHIỀU ═══════════════════════════════════════════════════════
      // Ánh sáng bùng ở nút đúng lúc cảnh dừng lại — lấp kín khoảnh khắc
      // chuyển hướng để không có frame nào bất động.
      tl.fromTo(
        q('.card-ignition'),
        { scale: 0, opacity: 0 },
        { scale: 1.5, opacity: 1, duration: 0.2, ease: 'power2.out' },
        0.14,
      ).to(q('.card-ignition'), { opacity: 0, duration: 0.14, ease: 'power1.in' }, 0.32);

      // ══ PHA 2: LAO NGƯỢC, TĂNG TỐC ═════════════════════════════════════
      // power4.in: gần như đứng yên lúc khởi, rồi bốc rất nhanh về cuối.
      // Hệ số để thẻ phủ KÍN khung nhìn rồi vượt qua camera. Tính từ kích
      // thước thật của thẻ và của màn hình, nên máy nào cũng tràn đủ — đặt
      // cứng một con số thì màn rộng sẽ thấy mép thẻ lọt trong khung.
      const cardEl = q('.auth-card') as HTMLElement | null;
      const cardRect = cardEl?.getBoundingClientRect();
      const fillScale = cardRect
        ? Math.max(window.innerWidth / cardRect.width, window.innerHeight / cardRect.height) * 1.9
        : 6;

      tl.to(q('.auth-card'), {
        scale: fillScale, z: 320, y: 0, filter: 'blur(6px)',
        duration: 0.29, ease: 'power4.in',
      }, 0.21);

      // Vòng TRONG vượt qua camera trước tiên và ra khỏi khung sớm.
      tl.to(qa('.grid-ring'), {
        scale: 6.5, opacity: 0, duration: 0.25, stagger: 0.025, ease: 'power4.in',
      }, 0.21);

      // Chữ bị giải phóng khỏi thẻ trong lúc thẻ đang lao tới.
      tl.to(q('.auth-card .sub'), {
        opacity: 0, y: 12, duration: 0.14, ease: 'power2.in',
      }, 0.24)
        .to(q('.auth-card h1'), {
          opacity: 0, scale: 0.92, filter: 'blur(4px)', duration: 0.16, ease: 'power2.in',
        }, 0.28)
        .to(q('.auth-kicker'), { opacity: 0, duration: 0.12, ease: 'power2.in' }, 0.3);

      // Vòng NGOÀI vượt qua muộn hơn và nán lại — chênh lệch này là thứ tạo
      // parallax, nếu cùng lúc thì lại thành zoom phẳng.
      tl.to(q('.orbit-motif'), {
        scale: 3.4, opacity: 0.12, rotate: 5, duration: 0.24, ease: 'power3.in',
      }, 0.3);

      // Hạt lao thẳng ra rìa khung theo hướng xuyên tâm → cảm giác tốc độ.
      tl.to(qa('.particle'), {
        x: (_i: number, el: HTMLElement) => (el.offsetLeft - window.innerWidth / 2) * 1.9,
        y: (_i: number, el: HTMLElement) => (el.offsetTop - window.innerHeight / 2) * 1.9,
        scale: 2.4, opacity: 0, duration: 0.22, stagger: 0.006, ease: 'power4.in',
      }, 0.32);

      // ── CAO TRÀO ────────────────────────────────────────────────────────
      tl.to(q('.auth-halo'), { scale: 5, opacity: 1, duration: 0.16, ease: 'power3.in' }, 0.36)
        .to(q('.orb'), { scale: 3.4, duration: 0.15, ease: 'power3.in' }, 0.38)
        .to(q('.auth-card'), { opacity: 0, filter: 'blur(14px)', duration: 0.1, ease: 'power2.in' }, 0.44)
        .to(q('.btn-oauth'), { opacity: 0, duration: 0.09, ease: 'power2.in' }, 0.45);

      // OAuth nổ đúng đỉnh; phần đuôi để redirect cắt ngang.
      tl.call(() => resolve(), [], 0.5);
    });
  }

  /**
   * Dựng lại cảnh sau khi người dùng bấm Back từ Google.
   *
   * clearProps xoá đúng những inline style GSAP đã ghi, trả các phần tử về
   * trạng thái CSS gốc; sau đó chạy lại entrance để trang vào có nhịp như lần
   * đầu, thay vì bật ra đột ngột.
   */
  private restoreAfterBack(): void {
    this.departureTl?.kill();
    this.departureTl = null;

    const host = this.page().nativeElement;
    host.classList.remove('is-departing');

    gsap.set(host.querySelectorAll(ANIMATED_SELECTORS), { clearProps: 'all' });

    // Cho bấm đăng nhập lại được — không reset thì nút kẹt vĩnh viễn ở trạng
    // thái "đang xử lý" của lần trước.
    this.submitting.set(false);
    this.errorMessage.set(null);
    this.revealed.set(true);

    this.playEntrance();
  }

  /** OAuth lỗi thì đưa cảnh về nguyên trạng, nhanh gọn. */
  private reverseDeparture(): void {
    const host = this.page().nativeElement;

    // Phải dừng timeline trước: phần đuôi vẫn đang chạy, không dừng thì nó
    // ghi đè lên chính animation phục hồi.
    this.departureTl?.kill();
    this.departureTl = null;
    host.classList.remove('is-departing');

    gsap.to(
      host.querySelectorAll(
        '.auth-card, .auth-card .sub, .auth-card h1, .auth-kicker,' +
          ' .btn-oauth, .login-nav, .auth-halo, .orb, .orb--offset, .orbit-motif,' +
          ' .grid-ring, .particle',
      ),
      {
        opacity: 1, scale: 1, x: 0, y: 0, z: 0, rotate: 0,
        filter: 'blur(0px)', clearProps: 'borderColor',
        duration: 0.28, ease: 'power2.out',
      },
    );
    gsap.set(host.querySelectorAll('.card-ignition'), { opacity: 0, scale: 0 });
  }

  /** Chuột chỉ làm các lớp dịch vài pixel — đủ để thấy có chiều sâu, không
   *  tới mức nghiêng ngả như giao diện game. */
  private initParallax(): void {
    // Cảnh có thể được dựng lại sau khi bấm Back — không guard thì mỗi lần
    // dựng lại sẽ chồng thêm một listener mousemove nữa.
    if (this.parallaxBound) return;
    this.parallaxBound = true;

    const host = this.page().nativeElement;
    const card = host.querySelector('.auth-card') as HTMLElement | null;
    const motif = host.querySelector('.orbit-motif') as HTMLElement | null;
    const halo = host.querySelector('.auth-halo') as HTMLElement | null;
    if (!card) return;

    const onMove = (event: MouseEvent): void => {
      const dx = event.clientX / window.innerWidth - 0.5;
      const dy = event.clientY / window.innerHeight - 0.5;
      // Biên độ khác nhau theo lớp: lớp xa dịch nhiều hơn lớp gần, đó là thứ
      // tạo ra cảm giác chiều sâu.
      gsap.to(card, { x: dx * 6, y: dy * 6, duration: 0.9, ease: 'power2.out' });
      if (motif) gsap.to(motif, { xPercent: dx * 1.6, yPercent: dy * 1.6, duration: 1.4, ease: 'power2.out' });
      if (halo) gsap.to(halo, { x: dx * 18, y: dy * 18, duration: 1.2, ease: 'power2.out' });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    this.destroyRef.onDestroy(() => window.removeEventListener('mousemove', onMove));
  }
}
