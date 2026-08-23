import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class LandingPage implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private revealObserver: IntersectionObserver | null = null;
  private navObserver: IntersectionObserver | null = null;
  private statsObserver: IntersectionObserver | null = null;

  protected readonly navScrolled = signal(false);

  protected readonly features: Feature[] = [
    {
      icon: '📅',
      title: 'Lịch cá nhân & nhiều lịch',
      description:
        'Tạo bao nhiêu lịch tùy thích, gắn màu riêng cho từng lịch, xem theo tuần/tháng/ngày/agenda và mời bạn bè cùng chỉnh sửa.',
    },
    {
      icon: '👥',
      title: 'Nhóm làm việc (Workspaces)',
      description:
        'Mỗi nhóm có lịch, bảng task Kanban và khung chat real-time riêng — mời thành viên, phân quyền owner/admin/member/guest chỉ trong vài giây.',
    },
    {
      icon: '✨',
      title: 'Trợ lý AI tích hợp',
      description:
        'Hỏi trợ lý AI ngay trong lịch để tạo sự kiện, tóm tắt lịch trình hoặc trả lời nhanh mà không cần rời khỏi màn hình.',
    },
    {
      icon: '🏮',
      title: 'Lịch âm & ngày lễ Việt Nam',
      description:
        'Ngày âm lịch hiển thị song song ngày dương trên mọi lưới lịch, kèm popup giới thiệu các ngày lễ lớn trong năm.',
    },
    {
      icon: '🔔',
      title: 'Nhắc nhở & lời mời',
      description:
        'Nhận thông báo nhắc việc đúng lúc, quản lý lời mời tham gia lịch/nhóm và không bao giờ bỏ lỡ sự kiện quan trọng.',
    },
    {
      icon: '🎨',
      title: '3 chủ đề màu',
      description:
        'Chọn màu nhấn Xanh dương, Xanh ngọc hoặc Tím — cộng thêm chế độ Sáng/Tối, đổi giao diện theo đúng gu của bạn.',
    },
  ];

  /**
   * Every number here is something the app actually ships — the labels spell
   * out what is being counted so the figure can be checked against the product
   * rather than taken on faith. Animated up from 0 on first scroll into view;
   * see initCounters.
   */
  protected readonly stats: Stat[] = [
    { value: 4, suffix: '', label: 'Chế độ xem: Ngày · Tuần · Tháng · Agenda' },
    { value: 3, suffix: '', label: 'Chủ đề màu: Xanh dương · Xanh ngọc · Tím' },
    { value: 2, suffix: '', label: 'Hệ lịch song song: Dương & Âm' },
    { value: 4, suffix: '', label: 'Vai trò nhóm: Owner · Admin · Member · Guest' },
  ];

  protected readonly marqueeItems: string[] = [
    'Lịch cá nhân',
    'Nhóm làm việc',
    'Trợ lý AI',
    'Lịch âm Việt Nam',
    'Bảng task Kanban',
    'Chat real-time',
    'Nhắc nhở thông minh',
    'Import file lịch',
  ];

  protected readonly steps: Step[] = [
    {
      number: '01',
      title: 'Đăng nhập không mật khẩu',
      description: 'Chỉ cần Gmail hoặc email — không cần nhớ thêm một mật khẩu nào nữa.',
    },
    {
      number: '02',
      title: 'Tạo lịch & mời nhóm',
      description: 'Dựng lịch cá nhân hoặc mở một Nhóm làm việc, mời đồng đội tham gia ngay.',
    },
    {
      number: '03',
      title: 'Cộng tác theo thời gian thực',
      description: 'Task, chat và sự kiện đồng bộ tức thì cho mọi thành viên trong nhóm.',
    },
  ];

  protected readonly faqs = signal<FaqItem[]>([
    {
      question: 'Tôi có thể dùng chung một lịch với người khác không?',
      answer:
        'Được. Bạn có thể mời người khác vào từng lịch riêng lẻ, hoặc mở một Nhóm làm việc để cả nhóm dùng chung lịch, bảng task và khung chat.',
    },
    {
      question: 'Tôi có cần cài đặt phần mềm gì không?',
      answer:
        'Không. Workflow chạy hoàn toàn trên trình duyệt, hoạt động tốt trên cả máy tính lẫn điện thoại, không cần tải ứng dụng riêng.',
    },
    {
      question: 'Dữ liệu lịch của tôi có an toàn không?',
      answer:
        'Có. Mỗi lịch và nhóm làm việc chỉ hiển thị cho đúng người bạn mời, và bạn có thể thu hồi quyền truy cập bất kỳ lúc nào.',
    },
    {
      question: 'Tôi đang dùng lịch khác, chuyển sang Workflow có mất công không?',
      answer:
        'Không — Workflow hỗ trợ nhập (import) file lịch sẵn có, và sự kiện xoá nhầm vẫn nằm trong Thùng rác để khôi phục lại.',
    },
    {
      question: 'Trợ lý AI hoạt động như thế nào?',
      answer:
        'Trợ lý AI nằm ngay trong màn hình lịch — chỉ cần mô tả việc cần làm bằng ngôn ngữ tự nhiên, AI sẽ giúp bạn tạo hoặc tra cứu sự kiện.',
    },
  ]);

  protected readonly openFaqIndex = signal<number | null>(0);
  protected readonly currentYear = new Date().getFullYear();

  toggleFaq(index: number): void {
    this.openFaqIndex.update((current) => (current === index ? null : index));
  }

  /**
   * In-page jump for the `#section` links.
   *
   * A bare `href="#features"` cannot be left to the browser here: changing the
   * fragment updates the location, the Router picks that up as a navigation and
   * tears down / rebuilds this component, so the click reads as a page reload
   * instead of a scroll. Cancelling the default and scrolling ourselves keeps
   * the href intact for middle-click and "copy link address" while never
   * touching the URL.
   */
  scrollToSection(event: Event, id: string): void {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  ngAfterViewInit(): void {
    this.initNavState();
    this.initScrollReveal();
    this.initCounters();
    this.initCardSpotlight();
    this.destroyRef.onDestroy(() => {
      this.revealObserver?.disconnect();
      this.navObserver?.disconnect();
      this.statsObserver?.disconnect();
    });
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Nav elevation is driven by a 1px sentinel leaving the viewport rather than
   * a `window:scroll` host listener. A scroll listener would run Angular change
   * detection on every scroll event — roughly 60x/second while scrolling, which
   * is exactly the kind of cost a low-end machine feels. The observer fires
   * twice instead: once on the way down, once on the way back up.
   */
  private initNavState(): void {
    const sentinel = this.host.nativeElement.querySelector('.nav-sentinel');
    if (!sentinel) return;

    this.navObserver = new IntersectionObserver(
      ([entry]) => this.navScrolled.set(!entry.isIntersecting),
      { threshold: 0 },
    );
    this.navObserver.observe(sentinel);
  }

  /**
   * Scroll-triggered reveal for everything below the hero (which animates
   * on load instead). Reduced-motion users just see every section already
   * in place — no observer needed for them.
   */
  private initScrollReveal(): void {
    if (this.prefersReducedMotion()) return;

    const targets = this.host.nativeElement.querySelectorAll('[data-reveal]') as NodeListOf<HTMLElement>;
    if (!targets.length) return;

    this.revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    targets.forEach((el) => this.revealObserver!.observe(el));
  }

  /**
   * Counts each stat up from 0 the first time the band scrolls into view.
   * Writes `textContent` directly from outside the zone: the template already
   * renders the final value, so this is a purely decorative overlay on top of
   * correct markup — running ~60 change-detection passes per second for a
   * second of eye candy would be a bad trade on a slow machine.
   */
  private initCounters(): void {
    if (this.prefersReducedMotion()) return;

    const band = this.host.nativeElement.querySelector('.stats');
    const values = this.host.nativeElement.querySelectorAll('.stat-value') as NodeListOf<HTMLElement>;
    if (!band || !values.length) return;

    this.statsObserver = new IntersectionObserver(
      (entries, observer) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        this.zone.runOutsideAngular(() => values.forEach((el) => this.countUp(el)));
      },
      { threshold: 0.4 },
    );
    this.statsObserver.observe(band);
  }

  private countUp(el: HTMLElement): void {
    const target = Number(el.dataset['target'] ?? 0);
    const suffix = el.dataset['suffix'] ?? '';
    const DURATION = 1100;
    let start = 0;
    let settled = false;

    const settle = (): void => {
      settled = true;
      el.textContent = `${target}${suffix}`;
    };

    const step = (now: number): void => {
      if (settled) return;
      if (!start) start = now;
      const progress = Math.min((now - start) / DURATION, 1);
      if (progress >= 1) {
        settle();
        return;
      }
      // easeOutCubic — fast out of the gate, settles gently on the final number.
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = `${Math.round(target * eased)}${suffix}`;
      requestAnimationFrame(step);
    };

    el.textContent = `0${suffix}`;
    requestAnimationFrame(step);

    // Safety net: rAF stops entirely in a hidden tab and can be starved on a
    // busy machine, which would strand the number partway up. The timer runs
    // on a different clock, so the correct figure always lands even if not a
    // single animation frame is delivered. The animation is the bonus here —
    // the right number is the requirement.
    const guard = setTimeout(settle, DURATION + 500);
    this.destroyRef.onDestroy(() => clearTimeout(guard));
  }

  /**
   * Cursor-following glow on the feature cards. One delegated listener for the
   * whole grid (not six), registered outside the zone so pointer movement never
   * triggers change detection, and coalesced to one write per animation frame
   * so a fast mouse can't queue up more work than the screen can show.
   */
  private initCardSpotlight(): void {
    if (this.prefersReducedMotion() || !window.matchMedia('(hover: hover)').matches) return;

    const grid = this.host.nativeElement.querySelector('.feature-grid') as HTMLElement | null;
    if (!grid) return;

    this.zone.runOutsideAngular(() => {
      let pending: PointerEvent | null = null;
      let frame = 0;

      const flush = (): void => {
        frame = 0;
        const event = pending;
        pending = null;
        if (!event) return;
        const card = (event.target as HTMLElement).closest('.feature-card') as HTMLElement | null;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      };

      const onMove = (event: PointerEvent): void => {
        pending = event;
        if (!frame) frame = requestAnimationFrame(flush);
      };

      grid.addEventListener('pointermove', onMove, { passive: true });
      this.destroyRef.onDestroy(() => {
        grid.removeEventListener('pointermove', onMove);
        if (frame) cancelAnimationFrame(frame);
      });
    });
  }
}
