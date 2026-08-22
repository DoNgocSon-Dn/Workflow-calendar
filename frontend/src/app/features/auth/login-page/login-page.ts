import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { ThemeToggle } from '../../../core/theme/theme-toggle/theme-toggle';

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
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);

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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = (event.clientY / window.innerHeight) * 2 - 1;
    const style = this.host.nativeElement.style;
    style.setProperty('--px', nx.toFixed(3));
    style.setProperty('--py', ny.toFixed(3));
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
