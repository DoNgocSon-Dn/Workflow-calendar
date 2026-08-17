import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { ThemeToggle } from '../../../core/theme/theme-toggle/theme-toggle';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('message'),
  );
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    const error = await this.authStore.signInWithPassword(email, password);
    this.submitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }
    await this.router.navigate(['/calendar']);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    const error = await this.authStore.signInWithGoogle();
    if (error) {
      this.errorMessage.set(error.message);
    }
  }
}
