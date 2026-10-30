import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginPage } from './login-page';

function setup(mode = 'login', returnUrl: string | null = null, checkEmail = false) {
  const auth = {
    session: () => null,
    signInWithPassword: vi.fn(async () => null),
    signUp: vi.fn(async () => ({ error: null, needsConfirmation: true })),
    requestPasswordReset: vi.fn(async () => null),
    updatePassword: vi.fn(async () => null),
  };
  const navigate = vi.fn(async () => true);
  const params = new Map([
    ['returnUrl', returnUrl],
    ['checkEmail', checkEmail ? '1' : null],
  ]);
  const queryParamMap = {
    has: (key: string) => !!params.get(key),
    get: (key: string) => params.get(key) ?? null,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: auth },
      { provide: Router, useValue: { navigateByUrl: navigate } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { routeConfig: { path: mode }, queryParamMap } },
      },
    ],
  });
  // Test the submission state machine without a browser or a real account.
  const page = TestBed.runInInjectionContext(() => new LoginPage()) as unknown as {
    email: { set(value: string): void };
    password: { set(value: string): void };
    confirmPassword: { set(value: string): void };
    busy(): boolean;
    error(): string | null;
    success(): string | null;
    mode(): string;
    authQueryParams: { returnUrl?: string };
    submit(): Promise<void>;
  };
  page.email.set('member@example.com');
  page.password.set('password123');
  page.confirmPassword.set('password123');
  return { page, auth, navigate };
}
afterEach(() => TestBed.resetTestingModule());

describe('email account screens', () => {
  it('returns to the original internal route after login', async () => {
    const { page, navigate } = setup('login', '/tasks');
    await page.submit();
    expect(navigate).toHaveBeenCalledWith('/tasks');
  });
  it('rejects external return URLs', async () => {
    const { page, navigate } = setup('login', '//evil.test');
    await page.submit();
    expect(navigate).toHaveBeenCalledWith('/calendar');
  });
  it('does not register mismatched passwords', async () => {
    const { page, auth } = setup('register');
    page.confirmPassword.set('different');
    await page.submit();
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(page.error()).toBeTruthy();
  });
  it('navigates to the login route after signup and carries the original destination', async () => {
    const { page, auth, navigate } = setup('register', '/groups/join/invite-token');
    await page.submit();
    expect(auth.signUp).toHaveBeenCalledWith(
      'member@example.com',
      'password123',
      '/groups/join/invite-token',
    );
    expect(navigate).toHaveBeenCalledWith(
      '/login?checkEmail=1&returnUrl=%2Fgroups%2Fjoin%2Finvite-token',
    );
  });
  it('shows the confirmation notice on the canonical login page', () => {
    const { page } = setup('login', '/groups/join/invite-token', true);
    expect(page.mode()).toBe('login');
    expect(page.success()).toBeTruthy();
    expect(page.authQueryParams).toEqual({ returnUrl: '/groups/join/invite-token' });
  });
  it('rejects a password reset without a valid recovery session', async () => {
    const { page, auth } = setup('reset-password');
    await page.submit();
    expect(auth.updatePassword).not.toHaveBeenCalled();
    expect(page.error()).toBeTruthy();
  });
  it('shows the same recovery confirmation without exposing account existence', async () => {
    const { page, auth } = setup('forgot-password');
    await page.submit();
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('member@example.com', undefined);
    expect(page.success()).toBeTruthy();
  });
  it('keeps the invitation destination in register, recovery and back-to-login links', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          ['login', 'register', 'forgot-password'].map((path) => ({ path, component: LoginPage })),
        ),
        { provide: AuthStore, useValue: { session: () => null } },
      ],
    });
    const harness = await RouterTestingHarness.create(
      '/login?returnUrl=%2Fgroups%2Fjoin%2Finvite-token',
    );
    expect(
      harness.routeNativeElement?.querySelector('a[href^="/register"]')?.getAttribute('href'),
    ).toBe('/register?returnUrl=%2Fgroups%2Fjoin%2Finvite-token');
    expect(
      harness.routeNativeElement
        ?.querySelector('a[href^="/forgot-password"]')
        ?.getAttribute('href'),
    ).toBe('/forgot-password?returnUrl=%2Fgroups%2Fjoin%2Finvite-token');
    await harness.navigateByUrl('/register?returnUrl=%2Fgroups%2Fjoin%2Finvite-token');
    expect(
      harness.routeNativeElement?.querySelector('a[href^="/login"]')?.getAttribute('href'),
    ).toBe('/login?returnUrl=%2Fgroups%2Fjoin%2Finvite-token');
  });
});
