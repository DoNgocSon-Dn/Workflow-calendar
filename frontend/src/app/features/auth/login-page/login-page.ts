import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { ThemeToggle } from '../../../core/theme/theme-toggle/theme-toggle';

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ThemeToggle],
  host: {
    '(mousemove)': 'onMouseMove($event)',
  },
})
export class LoginPage implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly particleCanvas = viewChild<ElementRef<HTMLCanvasElement>>('particleCanvas');

  // Cheap, non-reactive pointer tracking read by the particle loop for a
  // subtle parallax drift — deliberately not a signal, same reasoning as
  // onMouseMove below.
  private pointerX = 0;
  private pointerY = 0;
  private particles: AmbientParticle[] = [];
  private particleAnimationId: number | null = null;
  private particleResizeHandler: (() => void) | null = null;

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('message'),
  );

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.submitting.set(true);
    const { email } = this.form.getRawValue();
    const error = await this.authStore.signInWithEmailOnly(email);
    this.submitting.set(false);

    if (error) {
      if (error.name === 'MagicLinkSent' || error.name === 'EmailConfirmation') {
        this.successMessage.set(error.message);
      } else {
        this.errorMessage.set(error.message);
      }
      return;
    }
    await this.router.navigate(['/calendar']);
  }

  /**
   * Bypasses change detection on purpose: this drives a purely decorative
   * parallax effect on the brand panel and must not trigger a render on
   * every pointer move.
   */
  onMouseMove(event: MouseEvent): void {
    if (this.prefersReducedMotion()) {
      return;
    }
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = (event.clientY / window.innerHeight) * 2 - 1;
    this.pointerX = nx;
    this.pointerY = ny;
    const style = this.host.nativeElement.style;
    style.setProperty('--px', nx.toFixed(3));
    style.setProperty('--py', ny.toFixed(3));
  }

  /**
   * 3D tilt for the auth card, scoped to the card's own bounding box rather
   * than the whole viewport. Also bypasses change detection — pure DOM style
   * writes on a decorative effect.
   */
  onCardMouseMove(event: MouseEvent): void {
    if (this.prefersReducedMotion()) return;
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 14;
    const rotateX = (0.5 - py) * 14;
    const style = card.style;
    style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
    style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
    style.setProperty('--glow-x', `${(px * 100).toFixed(1)}%`);
    style.setProperty('--glow-y', `${(py * 100).toFixed(1)}%`);
  }

  onCardMouseLeave(event: MouseEvent): void {
    const style = (event.currentTarget as HTMLElement).style;
    style.setProperty('--tilt-x', '0deg');
    style.setProperty('--tilt-y', '0deg');
  }

  ngAfterViewInit(): void {
    this.initParticles();
    this.destroyRef.onDestroy(() => this.stopParticles());
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Lightweight canvas particle drift for the brand panel. Skipped entirely
   * on narrow viewports (the brand panel itself is hidden below 960px) and
   * when the user asked for reduced motion — no point paying the animation
   * cost for an effect nobody sees.
   */
  private initParticles(): void {
    if (this.prefersReducedMotion() || !window.matchMedia('(min-width: 960px)').matches) {
      return;
    }
    const canvasRef = this.particleCanvas();
    const canvas = canvasRef?.nativeElement;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = (): void => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    this.particleResizeHandler = resize;
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = 46;
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12 - 0.04,
      radius: Math.random() * 1.6 + 0.6,
      alpha: Math.random() * 0.5 + 0.15,
    }));

    const draw = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const driftX = this.pointerX * 6;
      const driftY = this.pointerY * 6;
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x - driftX, p.y - driftY, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.fill();
      }
      this.particleAnimationId = requestAnimationFrame(draw);
    };
    this.particleAnimationId = requestAnimationFrame(draw);
  }

  private stopParticles(): void {
    if (this.particleAnimationId !== null) {
      cancelAnimationFrame(this.particleAnimationId);
      this.particleAnimationId = null;
    }
    if (this.particleResizeHandler) {
      window.removeEventListener('resize', this.particleResizeHandler);
      this.particleResizeHandler = null;
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const error = await this.authStore.signInWithGoogle();
      if (error) {
        this.errorMessage.set(
          error.message.includes('provider') || error.message.includes('disabled')
            ? 'Đăng nhập Google chưa được kích hoạt trong Supabase Dashboard. Vui lòng thêm Google Client ID & Secret.'
            : error.message,
        );
      }
    } catch (err: any) {
      this.errorMessage.set('Lỗi đăng nhập Google: ' + (err?.message || 'Chưa cấu hình Google Credentials'));
    }
  }
}
