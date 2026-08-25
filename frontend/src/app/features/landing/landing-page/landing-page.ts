import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Khoá phiên: intro đầy đủ chỉ chạy MỘT lần mỗi phiên trình duyệt. Lần vào
 *  thứ hai trở đi, người dùng đã biết trang trông thế nào — bắt họ xem lại
 *  màn mở đầu là thu phí trên chính người quay lại nhiều nhất. */
const INTRO_SEEN_KEY = 'workflow-landing-intro-seen';

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class LandingPage implements OnInit, AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  protected readonly currentYear = new Date().getFullYear();

  /** Menu điều hướng trên mobile (<=860px). */
  protected readonly mobileMenuOpen = signal(false);

  /** Id của section đang chiếm phần trên khung nhìn. Null khi đang ở hero. */
  protected readonly activeSection = signal<string | null>(null);

  /**
   * Ánh xạ mục nav sang các section thuộc về nó, theo đúng thứ tự trên trang.
   *
   * "Tính năng" trải ra HAI section: #features chỉ là đoạn dẫn ngắn, còn nội
   * dung thật là #scrolly (cao 640svh, phần trình diễn 4 chức năng). Nếu chỉ
   * theo dõi #features thì cuộn qua khỏi đoạn dẫn là nav tắt sáng suốt cả
   * phần trình diễn.
   */
  private static readonly SPY_MAP: ReadonlyArray<{
    readonly nav: string;
    readonly sections: readonly string[];
  }> = [
    { nav: 'features', sections: ['features', 'scrolly'] },
    { nav: 'showcase', sections: ['showcase'] },
    { nav: 'process', sections: ['process'] },
    { nav: 'trust', sections: ['trust'] },
  ];

  /** Bảo đảm finishIntro() chỉ chạy một lần dù bị gọi từ mấy nguồn. */
  private introDone = false;
  private introTimeline: gsap.core.Timeline | null = null;
  /** Ba bước đầu của splash. Giữ tham chiếu để kết thúc sớm còn dừng được nó. */
  private splashTimeline: gsap.core.Timeline | null = null;

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('workflow-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    if (this.mobileMenuOpen()) this.mobileMenuOpen.set(false);
  }

  /** Escape đóng drawer — kỳ vọng chuẩn của mọi lớp phủ. */
  protected onEscape(): void {
    this.closeMobileMenu();
  }

  toggleTheme(event: MouseEvent): void {
    const btn = event.currentTarget as HTMLElement;
    const root = document.documentElement;
    const container = this.host.nativeElement.querySelector('.landing-container');

    const currentTheme = container?.getAttribute('data-theme') || root.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';

    const r = btn.getBoundingClientRect();
    const x = `${((r.left + r.width / 2) / window.innerWidth) * 100}%`;
    const y = `${((r.top + r.height / 2) / window.innerHeight) * 100}%`;
    root.style.setProperty('--tx', x);
    root.style.setProperty('--ty', y);

    const applyTheme = () => {
      root.setAttribute('data-theme', nextTheme);
      if (container) {
        container.setAttribute('data-theme', nextTheme);
      }
      localStorage.setItem('workflow-theme', nextTheme);
    };

    if ((document as any).startViewTransition) {
      (document as any).startViewTransition(applyTheme);
    } else {
      applyTheme();
    }
  }

  /** Khoảng hở giữa đáy thanh nav và dòng chữ đầu tiên của section. */
  private static readonly SCROLL_GAP = 28;

  scrollToSection(event: Event, id: string): void {
    // Bấm một mục trong drawer thì drawer phải đóng lại, nếu không nó che mất
    // đúng cái section vừa cuộn tới.
    this.closeMobileMenu();

    const target = this.host.nativeElement.querySelector(`#${id}`) as HTMLElement | null;
    if (!target) return;
    event.preventDefault();

    // KHÔNG dùng scrollIntoView({block:'start'}): nó neo MÉP HỘP của section
    // vào đầu khung nhìn, mà .section-pad có padding-top 128px nên chỗ được
    // neo lại đúng vùng trống. Tiêu đề section bị đẩy xuống tận ~215px, người
    // dùng tưởng chưa tới nơi và phải tự cuộn thêm một đoạn.
    //
    // Neo theo NỘI DUNG mới đúng: trừ padding-top ra khỏi điểm dừng, rồi chừa
    // lại đúng chiều cao nav cộng một khoảng hở. Đo nav bằng getBoundingClient-
    // Rect chứ không ghi cứng 88px như trước — nav thật chỉ cao ~65px, phần dư
    // 23px chính là một nửa cảm giác "chưa tới hẳn".
    const nav = this.host.nativeElement.querySelector('.landing-nav') as HTMLElement | null;
    const navHeight = nav?.getBoundingClientRect().height ?? 72;
    const padTop = parseFloat(getComputedStyle(target).paddingTop) || 0;
    const absoluteTop = target.getBoundingClientRect().top + window.scrollY;

    window.scrollTo({
      top: Math.max(0, absoluteTop + padTop - navHeight - LandingPage.SCROLL_GAP),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  ngAfterViewInit(): void {
    const savedTheme = localStorage.getItem('workflow-theme') || 'dark';
    const container = this.host.nativeElement.querySelector('.landing-container');
    if (container) {
      container.setAttribute('data-theme', savedTheme);
    }

    // Cổng animation: chỉ giấu nội dung khi CHẮC CHẮN sắp có animation chạy.
    // Mặc định của CSS là đã hiện, nên nếu khối dưới ném lỗi ở bất kỳ đâu thì
    // trang vẫn đọc được và nút CTA vẫn bấm được.
    container?.classList.add('js-anim');

    // Đặt ngoài zone.runOutsideAngular bên dưới: observer cần cập nhật
    // signal, mà signal phải chạy trong zone thì template mới vẽ lại.
    this.initSectionSpy();

    this.zone.runOutsideAngular(() => {
      const ctx = gsap.context(() => {
        try {
          this.initPreloader();
          this.initScrollProgress();
          this.initHeroParticles();
          this.initScrollAnimations();
          this.initScrollyShowcase();
          this.initCursorAndInteractiveEffects();
        } catch (err) {
          // Animation hỏng thì chỉ mất animation — không được phép làm mất
          // nội dung. Gỡ cổng là mọi thứ trở lại trạng thái hiện của CSS.
          console.error('[landing] animation init failed, falling back to static page', err);
          container?.classList.remove('js-anim');
          this.finishIntro();
        }
      }, this.host.nativeElement);

      this.destroyRef.onDestroy(() => {
        ctx.revert();
        this.teardown.forEach((off) => off());
        this.teardown = [];
      });
    });
  }

  /**
   * Làm sáng mục nav ứng với section đang xem.
   *
   * Dùng IntersectionObserver thay vì nghe scroll: trình duyệt tự tính giao
   * cắt ngoài luồng chính, không phải đo getBoundingClientRect mỗi frame.
   *
   * rootMargin cắt khung quan sát còn một dải ngang ở phần trên màn hình
   * (dưới thanh nav, trên giữa màn). Section nào phủ dải đó là section người
   * dùng đang đọc, chứ không phải section chỉ vừa ló lên từ mép dưới.
   */
  private initSectionSpy(): void {
    const host = this.host.nativeElement as HTMLElement;
    const targets = LandingPage.SPY_MAP.flatMap((entry) =>
      entry.sections
        .map((id) => host.querySelector(`#${id}`))
        .filter((el): el is Element => el !== null),
    );
    if (!targets.length) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // Nhiều section có thể cùng cắt dải quan sát; lấy mục nav nằm trên
        // cùng theo thứ tự trang để nó không nhảy qua lại khi cuộn chậm.
        const top =
          LandingPage.SPY_MAP.find((entry) =>
            entry.sections.some((id) => visible.has(id)),
          )?.nav ?? null;
        this.activeSection.set(top);
      },
      { rootMargin: '-88px 0px -55% 0px', threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    this.teardown.push(() => observer.disconnect());
  }

  /** Các hàm gỡ listener gắn ngoài phạm vi gsap.context() (window/document).
   *  ctx.revert() không đụng tới chúng, nên phải tự dọn — nếu không, rời khỏi
   *  trang landing rồi mà scroll/mousemove handler vẫn chạy suốt vòng đời app. */
  private teardown: Array<() => void> = [];

  /** Đăng ký listener kèm sẵn đường gỡ. */
  private on<E extends Event = Event>(
    target: Window | Document,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions,
  ): void {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.teardown.push(() => target.removeEventListener(type, listener, options));
  }

  /**
   * Đưa trang về trạng thái "intro đã xong". Gọi bao nhiêu lần cũng an toàn.
   *
   * Có BA nguồn gọi, và đó là chủ ý:
   *   1. onComplete của timeline — đường đi bình thường.
   *   2. setTimeout failsafe — setTimeout VẪN chạy khi tab ở chế độ nền, còn
   *      requestAnimationFrame (thứ GSAP dựa vào) thì bị bóp gần như đứng.
   *      Đây chính là kịch bản từng để lại trang không có nút CTA.
   *   3. visibilitychange — tab bị ẩn giữa chừng thì kết thúc luôn, đỡ phải
   *      xem một màn intro đã lỡ nhịp khi quay lại.
   */
  private finishIntro(): void {
    if (this.introDone) return;
    this.introDone = true;

    // progress(1) áp thẳng giá trị cuối của mọi tween, không cần chờ frame nào.
    this.introTimeline?.progress(1);
    this.introTimeline = null;

    // Splash thì kill chứ không progress(1): nó sắp bị display:none ngay dưới
    // đây, chạy nốt để rồi không ai nhìn thấy là phí frame vô ích.
    this.splashTimeline?.kill();
    this.splashTimeline = null;

    const host = this.host.nativeElement as HTMLElement;
    host.querySelectorAll<HTMLElement>('#preloader, .preloader-panel').forEach((el) => {
      el.style.display = 'none';
    });

    document.documentElement.classList.remove('is-loading');

    // Gỡ cổng chỉ cho phần hero: .reveal vẫn cần cổng vì ScrollTrigger còn
    // phải reveal chúng khi người dùng cuộn xuống.
    gsap.set(
      host.querySelectorAll('.hero-eyebrow, .hero-sub, .hero-cta, .hero-word, .hero-phrase'),
      { opacity: 1, y: 0, filter: 'blur(0px)', clearProps: 'filter' },
    );

    ScrollTrigger.refresh();
  }

  /**
   * Kịch bản splash 4 bước, tính bằng GIÂY (đơn vị của GSAP).
   *
   *   B1  0.0 ─► 0.6   icon hiện ngay chính giữa màn hình (mờ + phóng 0.85→1)
   *   B2  0.6 ─► 1.0   icon trượt lên 22px, wordmark vẫn ẩn hoàn toàn
   *   B3  1.0 ─► 1.5   wordmark hiện dần từ dưới lên, ngay dưới icon
   *       1.5 ─► 1.8   giữ nguyên khối hoàn chỉnh cho người dùng nhìn rõ
   *   B4  1.8 ─► 2.22  cả màn splash mờ dần, hero đã hiện sẵn phía sau
   */
  private static readonly SPLASH = {
    iconIn: 0.6,
    riseAt: 0.6,
    riseDur: 0.4,
    riseY: -22,
    wordAt: 1.0,
    wordDur: 0.5,
    /** Mốc bàn giao: timeline intro khởi động, cũng là lúc bước 4 bắt đầu. */
    handoff: 1800,
  } as const;

  /** Nhịp chuyển cảnh, tính bằng giây trên MỘT timeline duy nhất, gốc thời
   *  gian là mốc SPLASH.handoff. Gom về đây để đọc là thấy ngay chỗ nào chồng
   *  lên chỗ nào — trước kia nằm rải trong các setTimeout lồng nhau nên không
   *  thể chỉnh overlap.
   *
   *  Toàn bộ mốc đã dời sớm 0.3s so với bản trước: bước 4 giờ bắt đầu ngay ở
   *  giây 0 (trước là 0.35) nên hero cũng phải nhích lên tương ứng, nếu không
   *  splash kéo dài thêm bao nhiêu thì trang vào chậm thêm bấy nhiêu. */
  private static readonly CUE = {
    /** Bước 4 — mờ toàn màn splash. Bắt đầu ngay tại mốc bàn giao. */
    preloaderOut: 0,
    preloaderOutDur: 0.42,
    panelsOut: 0.2,
    ambientIn: 0,
    eyebrow: 0.3,
    title: 0.42,
    titleStagger: 0.085,
    sub: 1.05,
    cta: 1.3,
  } as const;

  private get reducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private initPreloader(): void {
    const root = document.documentElement;
    root.classList.add('is-loading');

    const el = <T extends HTMLElement>(sel: string) =>
      this.host.nativeElement.querySelector(sel) as T | null;

    const preloader = el('#preloader');
    const mark = el('#preloaderMark');
    const panelLeft = el('.preloader-panel.left');
    const panelRight = el('.preloader-panel.right');

    this.splitHeroText();

    // Tab mở ở chế độ nền (Ctrl+Click, khôi phục phiên): requestAnimationFrame
    // bị bóp nên timeline sẽ đứng giữa chừng. Bỏ qua intro luôn — người dùng
    // quay lại thấy trang hoàn chỉnh, không thấy một màn mở đầu dở dang.
    const seenThisSession = sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
    if (document.visibilityState === 'hidden' || seenThisSession || this.reducedMotion) {
      this.finishIntro();
      return;
    }
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');

    // Tab bị ẩn GIỮA CHỪNG intro thì cũng kết thúc luôn, vì lý do y hệt.
    this.on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.finishIntro();
    });

    if (!preloader || !mark || !panelLeft || !panelRight) {
      root.classList.remove('is-loading');
      this.playIntro(this.buildIntroTimeline(null));
      return;
    }

    const wordmark = el('.preloader-wordmark');
    const S = LandingPage.SPLASH;

    // Ba bước đầu chạy trên MỘT timeline riêng, tách khỏi timeline intro. Hai
    // bên có hai mốc gốc khác nhau (splash tính từ lúc vào trang, intro tính
    // từ mốc bàn giao) — nhét chung một timeline là mọi con số phải cộng trừ
    // theo nhau, sửa một chỗ hỏng cả dây.
    //
    // `mark` chính là khung icon. Wordmark KHÔNG đi theo nó: nó có vị trí cuối
    // cố định tính sẵn trong CSS, và chỉ hiện ra sau khi icon đã trượt xong.
    if (wordmark) {
      this.splashTimeline = gsap
        .timeline()
        // B1 — icon hiện tại chính giữa. power3.out hãm rất gắt ở cuối nên
        // icon "đáp" xuống chứ không trôi tới, mắt bắt được điểm dừng ngay.
        .fromTo(
          mark,
          { opacity: 0, scale: 0.85 },
          { opacity: 1, scale: 1, duration: S.iconIn, ease: 'power3.out' },
          0,
        )
        // B2 — trượt lên. GSAP giữ nguyên scale đã đặt ở B1 và chỉ thêm y.
        .to(mark, { y: S.riseY, duration: S.riseDur, ease: 'power2.out' }, S.riseAt)
        // B3 — wordmark dâng lên từ dưới.
        .fromTo(
          wordmark,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: S.wordDur, ease: 'power2.out' },
          S.wordAt,
        );
    }

    const startAt = window.setTimeout(() => {
      this.playIntro(this.buildIntroTimeline({ preloader, panelLeft, panelRight }));
    }, LandingPage.SPLASH.handoff);
    this.teardown.push(() => clearTimeout(startAt));
  }

  /** Chạy timeline intro kèm dây bảo hiểm bằng setTimeout. */
  private playIntro(tl: gsap.core.Timeline): void {
    this.introTimeline = tl;
    tl.play();

    // Dài hơn thời lượng thật một quãng rộng rãi. Nếu timeline chạy xong bình
    // thường thì finishIntro() đã khoá lại và lần gọi này không làm gì cả.
    const failsafe = window.setTimeout(() => this.finishIntro(), (tl.duration() + 2) * 1000);
    this.teardown.push(() => clearTimeout(failsafe));
  }

  /**
   * Preloader tan vào Hero thay vì biến mất rồi Hero mới chạy.
   *
   * Điểm mấu chốt: nền hero dựng ngay từ giây 0 và chữ hero vào ở giây 0.3,
   * trong khi preloader mờ từ 0 tới 0.42 — hai bên chồng nhau thật sự, người
   * xem không thấy một khoảnh khắc nào trang trống. Preloader chỉ bị
   * display:none ở cuối timeline.
   */
  private buildIntroTimeline(
    preloaderParts: {
      preloader: HTMLElement;
      panelLeft: HTMLElement;
      panelRight: HTMLElement;
    } | null,
  ): gsap.core.Timeline {
    const host = this.host.nativeElement;
    const CUE = LandingPage.CUE;
    const reduced = this.reducedMotion;

    // Easing riêng: vào mềm, tăng tốc, hãm chậm rồi đứng yên. Không overshoot
    // để tránh cảm giác playful.
    const CINEMATIC = 'cubic-bezier(0.22, 0.61, 0.24, 1)';
    const scale = reduced ? 0.35 : 1;

    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: CINEMATIC },
      onComplete: () => this.finishIntro(),
    });

    // --- Nền Hero hiện ra TRƯỚC, ngay phía sau preloader còn đang che ---
    tl.to(host.querySelector('.hero-ambient__glow'), { opacity: 1, duration: 1.4 * scale }, CUE.ambientIn * scale)
      .fromTo(
        host.querySelectorAll('.hero-ambient__ring'),
        { opacity: 0, scale: 0.92 },
        { opacity: 1, scale: 1, duration: 1.6 * scale, stagger: 0.12 * scale },
        CUE.ambientIn * scale,
      );

    if (preloaderParts) {
      const { preloader, panelLeft, panelRight } = preloaderParts;

      // BƯỚC 4 — mờ NGUYÊN màn splash bằng một tween duy nhất trên #preloader.
      // Trước đây còn một tween riêng làm khối logo mờ xuống 0.55 song song;
      // hai lớp mờ chồng nhau khiến logo tụt nhanh hơn nền, giữa chừng lộ ra
      // một khoảnh khắc "nền còn mà chữ đã bay". Một lớp là đủ và đúng.
      //
      // power1.inOut = ease-in-out: rời đi chậm, giữa nhanh, tới nơi chậm.
      tl.to(
        preloader,
        { opacity: 0, duration: CUE.preloaderOutDur * scale, ease: 'power1.inOut' },
        CUE.preloaderOut * scale,
      )
        .to(panelLeft, { xPercent: -100, duration: 0.9 * scale }, CUE.panelsOut * scale)
        .to(panelRight, { xPercent: 100, duration: 0.9 * scale }, CUE.panelsOut * scale);
    }

    // --- Hero bắt đầu KHI preloader còn đang mờ dần ---
    tl.to(host.querySelector('.hero-eyebrow'), { opacity: 1, y: 0, duration: 0.8 * scale }, CUE.eyebrow * scale)
      .to(
        host.querySelectorAll('.hero-word'),
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 1.05 * scale,
          stagger: reduced ? 0.02 : CUE.titleStagger,
        },
        CUE.title * scale,
      )
      .to(host.querySelector('.hero-sub'), { opacity: 1, duration: 0.7 * scale }, CUE.sub * scale)
      .to(
        host.querySelectorAll('.hero-phrase'),
        { opacity: 1, filter: 'blur(0px)', duration: 0.8 * scale, stagger: reduced ? 0.02 : 0.11 },
        CUE.sub * scale,
      )
      .to(host.querySelector('.hero-cta'), { opacity: 1, duration: 0.9 * scale }, CUE.cta * scale);

    if (!reduced) this.startAmbientDrift();
    return tl;
  }

  /** Tách tiêu đề thành TỪ và mô tả thành CỤM để reveal so le. Làm ở JS nên
   *  HTML giữ nguyên câu chữ, dễ đọc và dễ sửa nội dung sau này. */
  private splitHeroText(): void {
    const host = this.host.nativeElement as HTMLElement;

    host.querySelectorAll<HTMLElement>('.hero h1 .line > span').forEach((wrapper: HTMLElement) => {
      // em (chữ nhạt màu) phải giữ nguyên thẻ, nếu không mất luôn kiểu chữ.
      const target = wrapper.querySelector('em') ?? wrapper;
      const words = (target.textContent ?? '').trim().split(/\s+/);
      if (words.length === 0) return;
      target.innerHTML = words
        .map((w: string) => `<span class="hero-word">${w}</span>`)
        .join(' ');
    });

    // Lớp bọc .line > span vốn bị đẩy xuống 110% để giấu chữ. Tách từ xong thì
    // chính các .hero-word mới mang animation, nên trung hoà lớp bọc ngay bây
    // giờ — làm việc này giữa timeline sẽ tạo một cú nhảy thấy rõ.
    gsap.set(host.querySelectorAll('.hero h1 .line > span'), { y: '0%' });

    const sub = host.querySelector<HTMLElement>('.hero-sub');
    if (sub) {
      // Cắt theo dấu phẩy: mỗi cụm là một ý, đọc theo nhịp tự nhiên của câu.
      const phrases = (sub.textContent ?? '').trim().split(/(?<=,)\s+/);
      sub.innerHTML = phrases.map((ph: string) => `<span class="hero-phrase">${ph}</span>`).join(' ');
    }
  }

  /** Trôi rất chậm, biên độ nhỏ — người dùng chỉ nên CẢM thấy không gian có
   *  chiều sâu, không nên nhận ra là nó đang chuyển động. */
  private startAmbientDrift(): void {
    const host = this.host.nativeElement as HTMLElement;
    const rings = host.querySelectorAll<HTMLElement>('.hero-ambient__ring');
    rings.forEach((ring: HTMLElement, index: number) => {
      gsap.to(ring, {
        scale: 1.03,
        duration: 9 + index * 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    });

    gsap.to(host.querySelector('.hero-ambient__glow'), {
      opacity: 0.72,
      duration: 7,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }

  private initScrollProgress(): void {
    const bar = this.host.nativeElement.querySelector('#scrollProgress') as HTMLElement | null;
    if (!bar) return;

    const updateProgress = () => {
      const h = document.documentElement;
      const scrollTop = window.scrollY || h.scrollTop;
      const scrollHeight = h.scrollHeight - h.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      bar.style.width = `${pct}%`;
    };

    this.on(window, 'scroll', updateProgress, { passive: true });
    updateProgress();
  }

  private initHeroParticles(): void {
    const hero = this.host.nativeElement.querySelector('.hero') as HTMLElement | null;
    if (!hero || this.reducedMotion) return;

    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      const size = 2 + Math.random() * 3;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${55 + Math.random() * 40}%`;
      p.style.setProperty('--drift', `${Math.random() * 40 - 20}px`);
      p.style.animationDuration = `${6 + Math.random() * 6}s`;
      p.style.animationDelay = `${Math.random() * 6}s`;
      hero.appendChild(p);
    }
  }

  private initScrollAnimations(): void {
    // Hai tween này chạy VÔ HẠN. Reveal theo cuộn thì vẫn giữ (nó có điểm
    // dừng, và là cách nội dung xuất hiện), nhưng thứ quay/phồng mãi mãi thì
    // đúng là cái prefers-reduced-motion muốn loại bỏ.
    if (!this.reducedMotion) {
      const orb = this.host.nativeElement.querySelector('.orb');
      if (orb) {
        gsap.to(orb, { scale: 1.15, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }

      const gridRings = this.host.nativeElement.querySelectorAll('.grid-ring');
      if (gridRings.length) {
        gsap.to(gridRings, { rotate: 360, duration: 40, repeat: -1, ease: 'none', transformOrigin: 'center center' });
      }
    }

    const heroOrb = this.host.nativeElement.querySelector('.hero .orb');
    if (heroOrb) {
      gsap.to(heroOrb, {
        y: 150,
        opacity: 0,
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });
    }

    this.host.nativeElement.querySelectorAll('.reveal').forEach((el: Element) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });

    this.host.nativeElement.querySelectorAll('.section-title').forEach((title: Element) => {
      const original = title.innerHTML;
      const words = original.split(/(<span[^>]*>.*?<\/span>|\s+)/).filter(Boolean);
      // Kiểu dáng nằm trong CSS (.word-mask / .word-inner), không nhồi vào
      // thuộc tính style. Bản cũ đặt vertical-align:top kèm padding dọc
      // 0.12em ngay trên inline-block, khiến tiêu đề hai dòng có chữ tràn
      // xuống dưới hộp h2 và chạm vào đoạn mô tả ngay bên dưới.
      title.innerHTML = words
        .map((w: string) => {
          if (/^\s+$/.test(w)) return w;
          return `<span class="word-mask"><span class="word-inner">${w}</span></span>`;
        })
        .join('');

      gsap.to(title.querySelectorAll('.word-inner'), {
        y: '0%',
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.045,
        scrollTrigger: { trigger: title, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });

    const marquee = this.host.nativeElement.querySelector('.marquee') as HTMLElement | null;
    if (marquee) {
      marquee.addEventListener('mouseenter', () => (marquee.style.animationPlayState = 'paused'));
      marquee.addEventListener('mouseleave', () => (marquee.style.animationPlayState = 'running'));
    }
  }

  /**
   * Scrollytelling 3D: pin sân khấu lại rồi dùng scroll làm timeline.
   * Không có "camera" thật — thay vào đó biến đổi ngược lại trên .board
   * (scale/rotate/translate), đúng cách CSS 3D mô phỏng chuyển động camera.
   */
  private initScrollyShowcase(): void {
    const root = this.host.nativeElement as HTMLElement;
    const scrolly = root.querySelector('.scrolly') as HTMLElement | null;
    const viewport = root.querySelector('.scrolly-viewport') as HTMLElement | null;
    const board = root.querySelector('.board') as HTMLElement | null;
    if (!scrolly || !viewport || !board) return;

    // Giảm chuyển động: giữ nguyên layout xếp dọc tĩnh, vẫn đọc được đủ 5 khối.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    scrolly.classList.add('is-enhanced');

    const q = gsap.utils.selector(scrolly);
    const steps = q('.copy-step');
    const nodes = q('.node');
    const dots = q('.stage-dots li');
    const popAi = q('.pop-ai');
    const popEmail = q('.pop-email');
    const popWarn = q('.pop-warn');
    const popLunar = q('.pop-lunar');
    const cmdText = scrolly.querySelector('.cmd-text') as HTMLElement | null;

    const copy = scrolly.querySelector('.scrolly-copy') as HTMLElement | null;
    const boardWrap = scrolly.querySelector('.board-wrap') as HTMLElement | null;

    const PHRASE = 'Họp với Hùng thứ 6 tuần sau lúc 3 giờ chiều';

    /** Mốc bắt đầu của 5 stage trên timeline — dùng cho chấm chỉ báo. */
    const STAGE_AT = [0, 2.4, 4.6, 6.6, 8.6];

    /** Dưới ngưỡng này bố cục xếp chồng, không còn hai vùng trái/phải. */
    const SPLIT_MIN_WIDTH = 1100;

    /**
     * side = -1 nửa trái, +1 nửa phải.
     * Trả về hàm để GSAP tính lại mỗi lần refresh (invalidateOnRefresh),
     * nhờ vậy đổi cỡ cửa sổ là vị trí tự khớp lại.
     */
    const copySlot = (side: -1 | 1) => () => {
      const vw = viewport.clientWidth;
      if (vw < SPLIT_MIN_WIDTH || !copy) return 0;
      // CSS neo cột chữ ở left:6vw, nên nửa trái là x = 0.
      return side === -1 ? 0 : vw - vw * 0.12 - copy.offsetWidth;
    };

    /** Bảng luôn trượt về nửa đối diện cột chữ. */
    const boardSlot = (side: -1 | 1) => () => {
      const vw = viewport.clientWidth;
      if (vw < SPLIT_MIN_WIDTH || !copy) return 0;
      // Bảng đang được flex canh giữa sân khấu; đẩy đi nửa bề rộng cột
      // chữ cộng một khoảng hở là nó nằm gọn giữa nửa còn lại.
      return side * (copy.offsetWidth / 2 + vw * 0.02);
    };

    // ── trạng thái đầu ──
    gsap.set(steps, { opacity: 0, y: 26 });
    gsap.set(steps[0], { opacity: 1, y: 0 });
    // z: đẩy node ra trước mặt bảng theo trục Z thật, không chỉ dựa vào
    // z-index — trong preserve-3d thì vị trí Z mới là thứ quyết định.
    gsap.set(nodes, { opacity: 0, scale: 0.55, z: 60 });
    gsap.set([popAi, popEmail, popWarn, popLunar], { opacity: 0, y: 26 });
    gsap.set(q('.ev-ai'), { opacity: 0, scale: 0.7 });
    gsap.set(q('.ev-clash'), { opacity: 0 });
    gsap.set(board, { rotateX: 5, rotateY: -13, scale: 1, xPercent: 0, yPercent: 0 });
    if (copy) gsap.set(copy, { x: copySlot(-1) });
    if (boardWrap) gsap.set(boardWrap, { x: boardSlot(1) });
    if (cmdText) cmdText.textContent = '';

    // Trôi lơ lửng: tween riêng, vô hạn. Tách khỏi timeline cuộn nên nó
    // chỉ đụng `y`, còn timeline chỉ đụng `x` — GSAP gộp hai cái vào cùng
    // một transform mà không bên nào ghi đè bên nào.
    if (boardWrap) {
      gsap.to(boardWrap, {
        y: -14,
        duration: 4.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }

    /**
     * Đổi bên: cột chữ sang `copySide`, bảng sang nửa đối diện, đồng thời
     * nghiêng mặt bảng về phía cột chữ để nó luôn "quay mặt" vào nội dung.
     */
    const swapSides = (tl: gsap.core.Timeline, copySide: -1 | 1, at: number) => {
      if (copy) tl.to(copy, { x: copySlot(copySide), duration: 1.1 }, at);
      if (boardWrap) tl.to(boardWrap, { x: boardSlot(copySide === -1 ? 1 : -1), duration: 1.1 }, at);
    };

    /** Đưa đúng một khối chữ vào, đẩy khối trước ra — chạy được cả hai chiều cuộn. */
    const showStep = (tl: gsap.core.Timeline, index: number, at: number) => {
      steps.forEach((el, i) => {
        tl.to(el, { opacity: i === index ? 1 : 0, y: i === index ? 0 : 26, duration: 0.45 }, at);
      });
    };

    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut', duration: 1 },
      scrollTrigger: {
        trigger: scrolly,
        start: 'top top',
        end: 'bottom bottom',
        pin: viewport,
        pinSpacing: false,
        anticipatePin: 1,
        scrub: 1.2,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          // Các stage không dài bằng nhau (stage 0 được kéo dài để 4 node
          // kịp hiện hết), nên phải quy đổi progress về mốc thời gian
          // thật của timeline thay vì chia đều cho 5.
          const t = self.progress * (tl.duration() || 1);
          let i = 0;
          for (let k = STAGE_AT.length - 1; k >= 0; k--) {
            if (t >= STAGE_AT[k] - 0.4) {
              i = k;
              break;
            }
          }
          dots.forEach((d, k) => d.classList.toggle('on', k === i));
        },
      },
    });

    // Bảng và cột chữ đổi bên qua từng stage. Dấu rotateY luôn ngược dấu
    // vị trí bảng: bảng ở nửa phải thì nghiêng về trái (rotateY âm) để
    // mặt nó hướng vào cột chữ, và ngược lại.

    // ══ STAGE 0 — chữ TRÁI, bảng PHẢI: 4 node bung ra ══
    tl.to(nodes, { opacity: 1, scale: 1, duration: 0.7, stagger: 0.12 }, 0.15)
      .to(board, { rotateY: -13, rotateX: 5, duration: 1.2 }, 0);

    // ══ STAGE 1 — Trợ lý AI: chữ TRÁI, bảng PHẢI, nghiêng về trái ══
    showStep(tl, 1, 2.4);
    swapSides(tl, -1, 2.4);
    tl.to(nodes, { opacity: 0, scale: 0.7, duration: 0.5, stagger: 0.06 }, 2.3)
      .to(board, { rotateX: 4, rotateY: -13, scale: 1.18, xPercent: 0, yPercent: 12 }, 2.4)
      .to(popAi, { opacity: 1, y: 0, duration: 0.7 }, 2.9);

    // gõ chữ vào thanh lệnh — scrub được nên tua ngược vẫn xoá dần
    if (cmdText) {
      const typed = { n: 0 };
      tl.to(
        typed,
        {
          n: PHRASE.length,
          duration: 1.1,
          ease: 'none',
          onUpdate: () => {
            cmdText.textContent = PHRASE.slice(0, Math.round(typed.n));
          },
        },
        2.9,
      );
    }

    tl.to(q('.ev-ai'), { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, 3.9);

    // ══ STAGE 2 — Realtime & Email: chữ PHẢI, bảng TRÁI, nghiêng về phải ══
    showStep(tl, 2, 4.6);
    swapSides(tl, 1, 4.55);
    tl.to([popAi], { opacity: 0, y: -24, duration: 0.5 }, 4.5)
      .to(board, { rotateX: 5, rotateY: 14, scale: 1.06, xPercent: 0, yPercent: 0 }, 4.6)
      // Thẻ email bay vào từ phía bảng — stage này bảng ở bên TRÁI nên
      // thẻ vào từ trái, vẫn đọc ra là "tách khỏi lịch bay sang".
      .fromTo(
        popEmail,
        { opacity: 0, x: -60, y: 30, rotateY: -34 },
        { opacity: 1, x: 0, y: 0, rotateY: 0, duration: 0.85 },
        5.05,
      )
      .to(q('.pbtn.yes'), { scale: 0.94, duration: 0.18, yoyo: true, repeat: 1 }, 5.9);

    // ══ STAGE 3 — Phát hiện xung đột: chữ TRÁI, bảng PHẢI, nghiêng về trái ══
    showStep(tl, 3, 6.6);
    swapSides(tl, -1, 6.55);
    tl.to(popEmail, { opacity: 0, y: -28, duration: 0.5 }, 6.5)
      .to(board, { rotateX: 3, rotateY: -12, scale: 1.14, xPercent: 0, yPercent: -6 }, 6.6)
      .to(q('.ev-ai'), { opacity: 0.25, duration: 0.4 }, 6.6)
      .to(q('.ev-clash'), { opacity: 1, duration: 0.5, stagger: 0.18 }, 7.1)
      .to(popWarn, { opacity: 1, y: 0, duration: 0.7 }, 7.4);

    // ══ STAGE 4 — Lịch âm: chữ PHẢI, bảng TRÁI, nghiêng về phải ══
    showStep(tl, 4, 8.6);
    swapSides(tl, 1, 8.55);
    tl.to(popWarn, { opacity: 0, y: -24, duration: 0.5 }, 8.5)
      .to(q('.ev-clash'), { opacity: 0, duration: 0.4 }, 8.5)
      .to(q('.ev-ai'), { opacity: 1, duration: 0.5 }, 8.6)
      .to(board, { rotateX: 5, rotateY: 13, scale: 1.02, xPercent: 0, yPercent: 0 }, 8.6)
      .to(popLunar, { opacity: 1, y: 0, duration: 0.7 }, 9.0);
  }

  private initCursorAndInteractiveEffects(): void {
    // Nút bám chuột và thẻ nghiêng 3D đều là chuyển động do con trỏ điều
    // khiển, đúng loại mà prefers-reduced-motion muốn tắt.
    if (!window.matchMedia('(pointer:fine)').matches || this.reducedMotion) return;

    // Con trỏ chuột tuỳ biến (chấm + vòng đuổi theo) đã gỡ: nó che con trỏ
    // thật của hệ thống nên người dùng mất tín hiệu hình dạng con trỏ (I-beam
    // trên chữ, bàn tay trên link), và chạy một cặp tween theo mọi lần
    // mousemove là chi phí thường trực cho một thứ thuần trang trí.
    // Ba hiệu ứng bên dưới KHÔNG liên quan tới nó và vẫn giữ nguyên.

    this.host.nativeElement.querySelectorAll('.btn-primary, .btn-ghost, .nav-cta').forEach((btn: Element) => {
      btn.addEventListener('mousemove', (e: Event) => {
        const mouseEvt = e as MouseEvent;
        const r = (btn as HTMLElement).getBoundingClientRect();
        const x = (mouseEvt.clientX - r.left - r.width / 2) * 0.35;
        const y = (mouseEvt.clientY - r.top - r.height / 2) * 0.5;
        gsap.to(btn, { x, y, duration: 0.35, ease: 'power3.out' });
      });
      btn.addEventListener('mouseleave', () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' });
      });
    });

    this.host.nativeElement.querySelectorAll('.gallery-card').forEach((card: Element) => {
      const cardEl = card as HTMLElement;
      cardEl.style.transformStyle = 'preserve-3d';
      cardEl.addEventListener('mousemove', (e: Event) => {
        const mouseEvt = e as MouseEvent;
        const r = cardEl.getBoundingClientRect();
        const px = (mouseEvt.clientX - r.left) / r.width - 0.5;
        const py = (mouseEvt.clientY - r.top) / r.height - 0.5;
        gsap.to(cardEl, {
          rotateY: px * 8,
          rotateX: -py * 8,
          scale: 1.015,
          transformPerspective: 900,
          duration: 0.5,
          ease: 'power2.out',
        });
      });
      cardEl.addEventListener('mouseleave', () => {
        gsap.to(cardEl, { rotateY: 0, rotateX: 0, scale: 1, duration: 0.6, ease: 'power3.out' });
      });
    });

    const heroOrb = this.host.nativeElement.querySelector('.hero .orb');
    if (heroOrb) {
      this.on<MouseEvent>(window, 'mousemove', (e) => {
        const cx = (e.clientX / window.innerWidth - 0.5) * 40;
        const cy = (e.clientY / window.innerHeight - 0.5) * 40;
        gsap.to(heroOrb, { x: cx, y: cy, duration: 1, ease: 'power2.out' });
      });
    }
  }
}
