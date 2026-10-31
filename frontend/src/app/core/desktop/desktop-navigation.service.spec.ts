import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../auth/auth-store';
import { DesktopAlert, DesktopBridge } from './desktop-bridge';
import { DesktopNavigationService } from './desktop-navigation.service';

const alert: DesktopAlert = { id: 'r1', title: 'Họp nhóm', body: '9:00', kind: 'reminder', eventId: 'e1' };

function setup(url = '/tasks', clickedAlert = alert) {
  let clicked: ((alert: DesktopAlert) => void) | undefined;
  let cancelled: ((id: string) => void) | undefined;
  const detachedClick = vi.fn();
  const detachedCancelled = vi.fn();
  const acknowledge = vi.fn(async () => true);
  const user = signal<{ id: string } | null>({ id: 'user-1' });
  window.workflowDesktop = {
    onNotificationClick: (handler: (alert: DesktopAlert) => void) => { clicked = handler; return detachedClick; },
    onNotificationCancelled: (handler: (id: string) => void) => { cancelled = handler; return detachedCancelled; },
    acknowledgeNotificationClick: acknowledge,
  } as unknown as DesktopBridge;
  const navigateByUrl = vi.fn(async () => true);
  TestBed.configureTestingModule({ providers: [
    { provide: Router, useValue: { url, navigateByUrl } },
    { provide: AuthStore, useValue: { user } },
  ] });
  const service = TestBed.inject(DesktopNavigationService);
  TestBed.tick();
  return { service, user, navigateByUrl, acknowledge, detachedClick, detachedCancelled,
    click: () => clicked?.(clickedAlert), cancel: () => cancelled?.(clickedAlert.id) };
}

afterEach(() => { TestBed.resetTestingModule(); delete window.workflowDesktop; });

describe('desktop notification navigation', () => {
  it('routes a direct message to Contacts and waits for its consumer acknowledgment', () => {
    const direct = { ...alert, eventId: undefined, kind: 'message', peerId: 'peer-a' };
    const { service, click, navigateByUrl, acknowledge } = setup('/calendar', direct);
    click(); expect(navigateByUrl).toHaveBeenCalledWith('/contacts');
    expect(service.pending()).toEqual(direct); expect(acknowledge).not.toHaveBeenCalled();
    service.complete(direct.id); expect(acknowledge).toHaveBeenCalledWith(direct.id);
  });
  for (const url of ['/tasks', '/calendar/import', '/login']) {
    it(`retains the clicked target while navigating from ${url}`, () => {
      const { service, click, navigateByUrl, acknowledge } = setup(url);
      click();
      expect(navigateByUrl).toHaveBeenCalledWith('/calendar');
      expect(service.pending()).toEqual(alert);
      expect(acknowledge).not.toHaveBeenCalled();
    });
  }
  it('waits for the calendar consumer to finish before acknowledging the native popup', () => {
    const { service, click, navigateByUrl, acknowledge } = setup('/calendar?view=week');
    click();
    expect(navigateByUrl).not.toHaveBeenCalled();
    service.complete('unrelated');
    expect(service.pending()).toEqual(alert);
    service.complete(alert.id);
    expect(service.pending()).toBeNull();
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(alert.id);
  });
  it('cancels a pending destination when the popup is dismissed or snoozed', () => {
    const { service, click, cancel, acknowledge } = setup();
    click(); cancel();
    expect(service.pending()).toBeNull();
    expect(acknowledge).not.toHaveBeenCalled();
  });
  it('clears pending navigation when the signed-in account changes', () => {
    const { service, click, user } = setup();
    click(); user.set(null); TestBed.tick();
    expect(service.pending()).toBeNull();
  });
  it('detaches IPC listeners when the root service is destroyed', () => {
    const { detachedClick, detachedCancelled } = setup();
    TestBed.resetTestingModule();
    expect(detachedClick).toHaveBeenCalledOnce();
    expect(detachedCancelled).toHaveBeenCalledOnce();
  });
  it('does not require desktop-only dependencies in the ordinary web app', () => {
    delete window.workflowDesktop;
    TestBed.configureTestingModule({});
    expect(TestBed.inject(DesktopNavigationService).pending()).toBeNull();
  });
});
