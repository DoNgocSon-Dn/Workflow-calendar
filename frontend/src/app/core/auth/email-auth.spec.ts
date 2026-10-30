import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from './auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';

function setup(session: unknown = null, error: unknown = null) {
  const auth = {
    signInWithPassword: vi.fn(async () => ({ data: { session }, error })),
    signUp: vi.fn(async () => ({ data: { session }, error })),
    resetPasswordForEmail: vi.fn(async () => ({ error })),
    updateUser: vi.fn(async () => ({ error })),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { auth } }] });
  return { store: TestBed.inject(AuthStore), auth };
}

afterEach(() => TestBed.resetTestingModule());

describe('email authentication', () => {
  it('signs in with a trimmed email and preserves password whitespace', async () => {
    const session = { user: { id: 'u1' }, access_token: 'test-session' };
    const { store, auth } = setup(session);
    expect(await store.signInWithPassword(' member@example.com ', ' a password ')).toBeNull();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: ' a password ',
    });
    expect(store.user()?.id).toBe('u1');
  });
  it('requires email confirmation when registration creates no session', async () => {
    const { store } = setup();
    expect(await store.signUp('member@example.com', 'password123')).toEqual({
      error: null,
      needsConfirmation: true,
    });
    expect(store.session()).toBeNull();
  });
  it('carries an internal invitation path through the signup confirmation email', async () => {
    const { store, auth } = setup();
    await store.signUp('member@example.com', 'password123', '/groups/join/invite-token');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'password123',
      options: {
        emailRedirectTo: `${window.location.origin}/login?returnUrl=%2Fgroups%2Fjoin%2Finvite-token`,
      },
    });
  });
  it('does not carry external destinations into confirmation emails', async () => {
    const { store, auth } = setup();
    await store.signUp('member@example.com', 'password123', '//evil.example');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'password123',
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
  });
  it('does not hide authentication failures', async () => {
    const failure = { message: 'Invalid credentials' };
    const { store } = setup(null, failure);
    expect(await store.signInWithPassword('member@example.com', 'wrong')).toBe(failure);
    expect(store.session()).toBeNull();
  });
  it('sends password recovery back to the dedicated reset page', async () => {
    const { store, auth } = setup();
    await store.requestPasswordReset(' member@example.com ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('member@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    await store.updatePassword('new-password123');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password123' });
  });
  it('keeps an internal destination in the password recovery email', async () => {
    const { store, auth } = setup();
    await store.requestPasswordReset('member@example.com', '/tasks');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('member@example.com', {
      redirectTo: `${window.location.origin}/reset-password?returnUrl=%2Ftasks`,
    });
  });
});
