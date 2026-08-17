import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { ThemeToggle } from '../../../core/theme/theme-toggle/theme-toggle';

@Component({
  selector: 'app-forgot-password-page',
  templateUrl: './forgot-password-page.html',
  styleUrl: './forgot-password-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle],
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

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
    const error = await this.authStore.sendPasswordResetEmail(email);
    this.submitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }
    this.successMessage.set('Đã gửi email khôi phục mật khẩu. Vui lòng kiểm tra hộp thư của bạn.');
  }
}
