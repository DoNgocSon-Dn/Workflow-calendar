import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class LandingPage implements OnInit, AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  protected readonly currentYear = new Date().getFullYear();

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('workflow-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
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

  scrollToSection(event: Event, id: string): void {
    const target = this.host.nativeElement.querySelector(`#${id}`);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  ngAfterViewInit(): void {
    const savedTheme = localStorage.getItem('workflow-theme') || 'dark';
    const container = this.host.nativeElement.querySelector('.landing-container');
    if (container) {
      container.setAttribute('data-theme', savedTheme);
    }

    this.zone.runOutsideAngular(() => {
      const ctx = gsap.context(() => {
        this.initPreloader();
        this.initScrollProgress();
        this.initHeroParticles();
        this.initScrollAnimations();
        this.initScrollyShowcase();
        this.initCursorAndInteractiveEffects();
      }, this.host.nativeElement);

      this.destroyRef.onDestroy(() => {
        ctx.revert();
      });
    });
  }

  private initPreloader(): void {
    const root = document.documentElement;
    root.classList.add('is-loading');

    const preloader = this.host.nativeElement.querySelector('#preloader') as HTMLElement | null;
    const word = this.host.nativeElement.querySelector('#preloaderWord') as HTMLElement | null;
    const mark = this.host.nativeElement.querySelector('#preloaderMark') as HTMLElement | null;
    const panelLeft = this.host.nativeElement.querySelector('.preloader-panel.left') as HTMLElement | null;
    const panelRight = this.host.nativeElement.querySelector('.preloader-panel.right') as HTMLElement | null;

    if (!preloader || !word || !mark || !panelLeft || !panelRight) {
      root.classList.remove('is-loading');
      this.playHeroIntro();
      return;
    }

    const LETTER_REVEAL_DONE = 900;
    const WORD_HOLD = 500;
    const MARK_HOLD = 550;

    const finishPreloader = () => {
      preloader.style.transition = 'opacity .5s ease';
      preloader.style.opacity = '0';

      setTimeout(() => {
        panelLeft.style.transition = 'transform .9s cubic-bezier(.65,0,.35,1)';
        panelRight.style.transition = 'transform .9s cubic-bezier(.65,0,.35,1)';
        panelLeft.style.transform = 'translateX(-100%)';
        panelRight.style.transform = 'translateX(100%)';

        setTimeout(() => {
          preloader.style.display = 'none';
          panelLeft.style.display = 'none';
          panelRight.style.display = 'none';
          root.classList.remove('is-loading');
          ScrollTrigger.refresh();
          this.playHeroIntro();
        }, 950);
      }, 480);
    };

    setTimeout(() => {
      word.classList.add('hide');
      mark.classList.add('show');
      setTimeout(finishPreloader, 550 + MARK_HOLD);
    }, LETTER_REVEAL_DONE + WORD_HOLD);
  }

  private playHeroIntro(): void {
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .to(this.host.nativeElement.querySelector('.hero-eyebrow'), { opacity: 1, y: 0, duration: 0.8 }, 0)
      .to(this.host.nativeElement.querySelectorAll('.hero h1 .line span'), { y: '0%', duration: 1, stagger: 0.12 }, 0.08)
      .to(this.host.nativeElement.querySelector('.hero-sub'), { opacity: 1, duration: 0.9 }, 0.6)
      .to(this.host.nativeElement.querySelector('.hero-cta'), { opacity: 1, duration: 0.9 }, 0.75);
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

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  private initHeroParticles(): void {
    const hero = this.host.nativeElement.querySelector('.hero') as HTMLElement | null;
    if (!hero) return;

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
    const orb = this.host.nativeElement.querySelector('.orb');
    if (orb) {
      gsap.to(orb, { scale: 1.15, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }

    const gridRings = this.host.nativeElement.querySelectorAll('.grid-ring');
    if (gridRings.length) {
      gsap.to(gridRings, { rotate: 360, duration: 40, repeat: -1, ease: 'none', transformOrigin: 'center center' });
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

    this.host.nativeElement.querySelectorAll('.feature-visual').forEach((el: Element) => {
      gsap.fromTo(
        el,
        { scale: 0.92 },
        {
          scale: 1,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' },
        }
      );
    });

    this.host.nativeElement.querySelectorAll('.section-title').forEach((title: Element) => {
      const original = title.innerHTML;
      const words = original.split(/(<span[^>]*>.*?<\/span>|\s+)/).filter(Boolean);
      title.innerHTML = words
        .map((w: string) => {
          if (/^\s+$/.test(w)) return w;
          return `<span class="word-mask" style="display:inline-block; overflow:visible; vertical-align:top; padding-top:0.12em; padding-bottom:0.12em;"><span class="word-inner" style="display:inline-block; transform:translateY(115%);">${w}</span></span>`;
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
    const popTimer = q('.pop-timer');
    const cmdText = scrolly.querySelector('.cmd-text') as HTMLElement | null;
    const ringFg = scrolly.querySelector('.ring-fg') as SVGCircleElement | null;
    const ringTime = scrolly.querySelector('.ring-time') as HTMLElement | null;

    const PHRASE = 'Họp với Hùng thứ 6 tuần sau lúc 3 giờ chiều';
    const RING_LEN = 327;

    /** Mốc bắt đầu của 5 stage trên timeline — dùng cho chấm chỉ báo. */
    const STAGE_AT = [0, 2.4, 4.6, 6.6, 8.6];

    // ── trạng thái đầu ──
    // Vị trí ngang của bảng và cột chữ giờ do CSS quyết định (sân khấu
    // chiếm 56% bên phải, cột chữ nằm bên trái), nên ở đây chỉ còn lo
    // góc camera và nội dung.
    gsap.set(steps, { opacity: 0, y: 26 });
    gsap.set(steps[0], { opacity: 1, y: 0 });
    // z: đẩy node ra trước mặt bảng theo trục Z thật, không chỉ dựa vào
    // z-index — trong preserve-3d thì vị trí Z mới là thứ quyết định.
    gsap.set(nodes, { opacity: 0, scale: 0.55, z: 60 });
    gsap.set([popAi, popEmail, popWarn, popTimer], { opacity: 0, y: 26 });
    gsap.set(q('.ev-ai'), { opacity: 0, scale: 0.7 });
    gsap.set(q('.ev-clash'), { opacity: 0 });
    gsap.set(board, { rotateX: 12, rotateY: -16, scale: 1, xPercent: 0, yPercent: 0 });
    if (ringFg) gsap.set(ringFg, { strokeDashoffset: RING_LEN });
    if (cmdText) cmdText.textContent = '';

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

    // Bảng đứng yên bên phải suốt cả 5 stage — chỉ góc nhìn đổi. Ở đây
    // xPercent/yPercent chỉ dùng để lia camera trong phạm vi sân khấu,
    // không còn kiêm việc đẩy bảng tránh cột chữ như trước.

    // ══ STAGE 0: 4 node bung ra quanh bảng ══
    tl.to(nodes, { opacity: 1, scale: 1, duration: 0.7, stagger: 0.12 }, 0.15)
      .to(board, { rotateY: -10, rotateX: 9, duration: 1.2 }, 0);

    // ══ STAGE 1 — Trợ lý AI: lia lên thanh nhập lệnh ══
    showStep(tl, 1, 2.4);
    tl.to(nodes, { opacity: 0, scale: 0.7, duration: 0.5, stagger: 0.06 }, 2.3)
      .to(board, { rotateX: 6, rotateY: -7, scale: 1.22, xPercent: 4, yPercent: 14 }, 2.4)
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

    // ══ STAGE 2 — Realtime & Email: xoay bảng lộ góc nhìn khác ══
    showStep(tl, 2, 4.6);
    tl.to([popAi], { opacity: 0, y: -24, duration: 0.5 }, 4.5)
      .to(board, { rotateX: 8, rotateY: 22, scale: 1.06, xPercent: 0, yPercent: 0 }, 4.6)
      // Thẻ email bay vào từ phía bảng (bên phải) để vẫn đọc là "tách ra
      // khỏi lịch", nhưng đích đến nằm gọn trong cột chữ.
      .fromTo(
        popEmail,
        { opacity: 0, x: 60, y: 30, rotateY: 34 },
        { opacity: 1, x: 0, y: 0, rotateY: 0, duration: 0.85 },
        5.05,
      )
      .to(q('.pbtn.yes'), { scale: 0.94, duration: 0.18, yoyo: true, repeat: 1 }, 5.9);

    // ══ STAGE 3 — Phát hiện xung đột: lia xuống lưới giờ ══
    showStep(tl, 3, 6.6);
    tl.to(popEmail, { opacity: 0, y: -28, duration: 0.5 }, 6.5)
      .to(board, { rotateX: 4, rotateY: -6, scale: 1.16, xPercent: 0, yPercent: -8 }, 6.6)
      .to(q('.ev-ai'), { opacity: 0.25, duration: 0.4 }, 6.6)
      .to(q('.ev-clash'), { opacity: 1, duration: 0.5, stagger: 0.18 }, 7.1)
      .to(popWarn, { opacity: 1, y: 0, duration: 0.7 }, 7.4);

    // ══ STAGE 4 — Tập trung: bảng nhoè đi như xoá nét (depth of field) ══
    showStep(tl, 4, 8.6);
    tl.to(popWarn, { opacity: 0, y: -24, duration: 0.5 }, 8.5)
      .to(q('.ev-clash'), { opacity: 0, duration: 0.4 }, 8.5)
      // Chỉ blur, không hạ opacity: giảm mờ đục làm bảng bạc phếch, còn
      // blur đơn thuần đọc ra là "mất nét vì camera lấy nét chỗ khác".
      .to(board, { rotateX: 10, rotateY: -18, scale: 0.92, xPercent: 0, yPercent: 0 }, 8.6)
      // blur đặt trên .board-wrap chứ không phải .board: filter làm phẳng
      // ngữ cảnh 3D của chính element mang nó, để trên .board thì 3 lớp
      // độ dày translateZ sẽ sập chồng lên nhau.
      .to(q('.board-wrap'), { filter: 'blur(7px)', duration: 1 }, 8.6)
      .to(popTimer, { opacity: 1, y: 0, duration: 0.7 }, 9.0);

    if (ringFg) {
      tl.to(ringFg, { strokeDashoffset: RING_LEN * 0.32, duration: 1.4, ease: 'none' }, 9.2);
    }

    if (ringTime) {
      const clock = { s: 1458 }; // 24:18
      tl.to(
        clock,
        {
          s: 1015, // 16:55
          duration: 1.4,
          ease: 'none',
          onUpdate: () => {
            const s = Math.round(clock.s);
            const mm = String(Math.floor(s / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            ringTime.textContent = `${mm}:${ss}`;
          },
        },
        9.2,
      );
    }
  }

  private initCursorAndInteractiveEffects(): void {
    if (!window.matchMedia('(pointer:fine)').matches) return;

    const dot = this.host.nativeElement.querySelector('#cursorDot') as HTMLElement | null;
    const ring = this.host.nativeElement.querySelector('#cursorRing') as HTMLElement | null;
    if (!dot || !ring) return;

    const moveDot = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3.out' });
    const moveDotY = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3.out' });
    const moveRing = gsap.quickTo(ring, 'x', { duration: 0.4, ease: 'power3.out' });
    const moveRingY = gsap.quickTo(ring, 'y', { duration: 0.4, ease: 'power3.out' });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      moveDot(e.clientX);
      moveDotY(e.clientY);
      moveRing(e.clientX);
      moveRingY(e.clientY);
    });

    this.host.nativeElement
      .querySelectorAll('a, button, .gallery-card, .feature-visual, .theme-toggle')
      .forEach((el: Element) => {
        el.addEventListener('mouseenter', () => ring.classList.add('hovered'));
        el.addEventListener('mouseleave', () => ring.classList.remove('hovered'));
      });

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

    this.host.nativeElement.querySelectorAll('.gallery-card, .feature-visual').forEach((card: Element) => {
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
      window.addEventListener('mousemove', (e: MouseEvent) => {
        const cx = (e.clientX / window.innerWidth - 0.5) * 40;
        const cy = (e.clientY / window.innerHeight - 0.5) * 40;
        gsap.to(heroOrb, { x: cx, y: cy, duration: 1, ease: 'power2.out' });
      });
    }
  }
}
