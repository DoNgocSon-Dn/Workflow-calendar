import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../auth/auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';
import { NotificationService } from './notification.service';
import { NotificationSoundService } from './notification-sound.service';
import { BirthdayPopupService } from './birthday-popup.service';

function setup() {
  const user = signal<{id: string; user_metadata: Record<string,string>} | null>({ id: 'a', user_metadata: {} });
  const updateUser = vi.fn(async () => ({ error: null as Error | null }));
  TestBed.configureTestingModule({ providers: [
    { provide: AuthStore, useValue: { user } },
    { provide: SUPABASE_CLIENT, useValue: { auth: { updateUser } } },
    { provide: NotificationSoundService, useValue: { notify: vi.fn(), enabled: () => false } },
  ] });
  return { user, updateUser };
}
afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

describe('account-scoped personal data', () => {
  it('does not carry notification history into another account or signed-out state', () => {
    const { user } = setup();
    const center = TestBed.inject(NotificationService);
    center.ingest({ id: 'n1', type: 'system', title: 'Private A', message: 'Only A', createdAt: new Date().toISOString() });
    user.set({ id: 'b', user_metadata: {} });
    expect(center.notifications()).toEqual([]);
    center.ingest({ id: 'n2', type: 'system', title: 'Private B', message: 'Only B', createdAt: new Date().toISOString() });
    user.set({ id: 'a', user_metadata: {} });
    expect(center.notifications().map(n => n.id)).toEqual(['n1']);
    user.set(null); expect(center.notifications()).toEqual([]);
  });
  it('prefers account metadata and never borrows an unowned global birthday', async () => {
    const { user, updateUser } = setup();
    localStorage.setItem('workflow_user_dob', '1990-01-01');
    const birthday = TestBed.inject(BirthdayPopupService);
    expect(birthday.getUserDob()).toBe('');
    await birthday.setUserDob('2000-05-15');
    expect(birthday.getUserDob()).toBe('2000-05-15');
    user.set({ id: 'b', user_metadata: { date_of_birth: '2001-06-16' } });
    expect(birthday.getUserDob()).toBe('2001-06-16');
    updateUser.mockResolvedValue({ error: new Error('Offline') });
    await expect(birthday.setUserDob('2002-01-01')).rejects.toThrow('Offline');
    expect(localStorage.getItem('workflow_user_dob:b')).toBeNull();
    user.set(null); expect(birthday.getUserDob()).toBe('');
  });
});
