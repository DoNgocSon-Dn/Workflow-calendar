import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { authEmailRedirect } from './auth-return-url';

afterEach(() => vi.restoreAllMocks());

describe('native email return URL', () => {
  it('uses the public recovery page instead of the WebView localhost origin', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    expect(authEmailRedirect('/reset-password', '/calendar'))
      .toBe('https://workflow-calendar.vercel.app/reset-password?returnUrl=%2Fcalendar');
    expect(authEmailRedirect('/login', '//outside.example'))
      .toBe('https://workflow-calendar.vercel.app/login');
  });
});
