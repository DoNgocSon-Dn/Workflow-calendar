import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../auth/auth-store';
import { SocialStore } from '../../features/social/social.store';
import { MobileNavigation, hasMobileTabs } from './mobile-navigation';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
async function setup(native = true) {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(native);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(native ? 'android' : 'web');
  const user = signal<{ id: string } | null>({ id: 'me' });
  TestBed.configureTestingModule({ imports: [MobileNavigation], providers: [
    provideRouter([{ path: 'calendar', children: [] }, { path: 'contacts', children: [] }, { path: 'login', children: [] }]),
    { provide: AuthStore, useValue: { user } },
    { provide: SocialStore, useValue: { unreadCount: signal(7), badge: signal(9), overview: signal({ incoming: [{}, {}] }) } },
  ] });
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/calendar');
  const fixture = TestBed.createComponent(MobileNavigation);
  await fixture.whenStable();
  return { fixture, router, user, host: fixture.nativeElement as HTMLElement };
}
describe('native mobile navigation', () => {
  it('keeps tabs off authentication, import and group join routes', () => {
    expect(hasMobileTabs('/calendar')).toBe(true);
    expect(hasMobileTabs('/contacts?peer=a#latest')).toBe(true);
    for (const url of ['/login?returnUrl=/calendar', '/import', '/groups/join/a', '/calendar-other']) expect(hasMobileTabs(url)).toBe(false);
  });
  it('does not add a second navigation to web or desktop', async () => {
    const { host } = await setup(false);
    expect(host.querySelector('nav')).toBeNull();
    expect(document.documentElement.classList.contains('mobile-tab-layout')).toBe(false);
  });
  it('shows the selected tab, unread badge and updates after navigation', async () => {
    const { host, router, fixture } = await setup();
    expect(host.querySelectorAll('a')).toHaveLength(3);
    expect(host.querySelector('a[aria-current=page]')?.getAttribute('href')).toBe('/calendar');
    expect(host.querySelector('.tab-badge')?.textContent).toBe('9');
    expect(host.querySelector('.tab-badge')?.getAttribute('aria-label')).toContain('2');
    await router.navigateByUrl('/contacts?peer=a');
    await fixture.whenStable();
    expect(host.querySelector('a[aria-current=page]')?.getAttribute('href')).toBe('/contacts');
  });
  it('removes reserved tab space after logout and on login screens', async () => {
    const { host, user, fixture, router } = await setup();
    expect(document.documentElement.classList.contains('mobile-tab-layout')).toBe(true);
    user.set(null); await fixture.whenStable();
    expect(host.querySelector('nav')).toBeNull();
    expect(document.documentElement.classList.contains('mobile-tab-layout')).toBe(false);
    user.set({ id: 'me' }); await router.navigateByUrl('/login'); await fixture.whenStable();
    expect(host.querySelector('nav')).toBeNull();
  });
});
