import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { safeAuthReturnUrl } from '../../../core/auth/auth-return-url';
import { desktopBridge } from '../../../core/desktop/desktop-bridge';
import { isAndroidApp } from '../../../core/mobile/mobile-platform';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ThemeService } from '../../../core/theme/theme-service';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, BrandLogo],
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly i18n = inject(TranslationService);
  protected readonly theme = inject(ThemeService);
  protected readonly desktop = desktopBridge();
  protected readonly android = isAndroidApp();
  protected readonly returnUrl = safeAuthReturnUrl(
    this.route.snapshot.queryParamMap.get('returnUrl'),
  );
  protected readonly authQueryParams = this.returnUrl ? { returnUrl: this.returnUrl } : {};
  protected readonly mode = signal<AuthMode>(
    (this.route.snapshot.routeConfig?.path as AuthMode) || 'login',
  );
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showPassword = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(
    this.route.snapshot.queryParamMap.has('sessionExpired')
      ? this.i18n.t('login.sessionExpired')
      : null,
  );
  protected readonly success = signal<string | null>(
    this.route.snapshot.queryParamMap.get('checkEmail') === '1'
      ? this.i18n.t('auth.confirmEmail')
      : null,
  );
  protected readonly heading = computed(() =>
    this.i18n.t(
      {
        login: 'auth.signIn',
        register: 'auth.signUp',
        'forgot-password': 'auth.forgotTitle',
        'reset-password': 'auth.resetTitle',
      }[this.mode()],
    ),
  );
  protected readonly needsPassword = computed(() => this.mode() !== 'forgot-password');
  protected readonly needsConfirmation = computed(() =>
    ['register', 'reset-password'].includes(this.mode()),
  );

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.success.set(null);
    if (this.needsConfirmation() && this.password().length < 8) {
      this.error.set(this.i18n.t('auth.passwordLength'));
      return;
    }
    if (this.needsConfirmation() && this.password() !== this.confirmPassword()) {
      this.error.set(this.i18n.t('auth.passwordMismatch'));
      return;
    }
    if (this.mode() === 'reset-password' && !this.auth.session()) {
      this.error.set(this.i18n.t('auth.expiredLink'));
      return;
    }
    this.busy.set(true);
    try {
      if (this.mode() === 'forgot-password') {
        const error = await this.auth.requestPasswordReset(this.email(), this.returnUrl);
        if (error) throw error;
        this.success.set(this.i18n.t('auth.resetSent'));
        return;
      }
      if (this.mode() === 'register') {
        const { error, needsConfirmation } = await this.auth.signUp(
          this.email(),
          this.password(),
          this.returnUrl,
        );
        if (error) throw error;
        if (needsConfirmation) {
          this.password.set('');
          this.confirmPassword.set('');
          const query = new URLSearchParams({ checkEmail: '1' });
          if (this.returnUrl) query.set('returnUrl', this.returnUrl);
          await this.router.navigateByUrl(`/login?${query}`);
          return;
        }
      } else if (this.mode() === 'reset-password') {
        const error = await this.auth.updatePassword(this.password());
        if (error) throw error;
      } else {
        const error = await this.auth.signInWithPassword(this.email(), this.password());
        if (error) throw error;
      }
      this.password.set('');
      this.confirmPassword.set('');
      await this.router.navigateByUrl(this.returnUrl ?? '/calendar');
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : '';
      if (code === 'invalid_credentials') this.error.set(this.i18n.t('auth.invalidCredentials'));
      else if (code === 'email_not_confirmed') this.error.set(this.i18n.t('auth.confirmEmail'));
      else if (/rate|too many/i.test(message)) this.error.set(this.i18n.t('auth.rateLimited'));
      else if (/fetch|network|failed to|timeout/i.test(message))
        this.error.set(this.i18n.t('auth.networkError'));
      else this.error.set(message || this.i18n.t('auth.failed'));
    } finally {
      this.busy.set(false);
    }
  }
}
