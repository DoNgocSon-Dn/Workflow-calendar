import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginPage } from './login-page';

function setup(mode = 'login', returnUrl: string | null = null) {
  const auth = {
    session: () => null,
    signInWithPassword: vi.fn(async () => null),
    signUp: vi.fn(async () => ({ error: null, needsConfirmation: true })),
    requestPasswordReset: vi.fn(async () => null),
    updatePassword: vi.fn(async () => null),
  };
  const navigate = vi.fn(async () => true);
  const queryParamMap = { has: () => false, get: () => returnUrl };
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
  it('waits for email confirmation instead of entering a protected page', async () => {
    const { page, navigate } = setup('register');
    await page.submit();
    expect(navigate).not.toHaveBeenCalled();
    expect(page.mode()).toBe('login');
    expect(page.success()).toBeTruthy();
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
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('member@example.com');
    expect(page.success()).toBeTruthy();
  });
});
