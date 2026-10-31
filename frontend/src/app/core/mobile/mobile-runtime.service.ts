import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { DesktopNavigationService } from '../desktop/desktop-navigation.service';
import { MobileNotificationsService } from './mobile-notifications.service';
import { isAndroidApp } from './mobile-platform';
import { closeMobileDialog } from './mobile-back';

@Injectable({ providedIn: 'root' })
export class MobileRuntimeService {
  constructor() {
    if (!isAndroidApp()) return;
    const router = inject(Router);
    const notifications = inject(MobileNotificationsService);
    const navigation = inject(DesktopNavigationService);
    const destroy = inject(DestroyRef);
    // Let native insets protect every page and full-screen dialog from system bars.
    document.querySelector('meta[name="viewport"]')?.setAttribute('content',
      'width=device-width, initial-scale=1, viewport-fit=contain');
    document.documentElement.classList.add('workflow-android');
    notifications.onOpen = (alert) => navigation.open(alert);
    notifications.refresh();
    const resume = () => notifications.refresh();
    window.addEventListener('online', resume);
    const handles = [
      App.addListener('appStateChange', ({ isActive }) => { if (isActive) resume(); }),
      App.addListener('backButton', ({ canGoBack }) => {
        if (closeMobileDialog()) return;
        if (/^\/calendar(?:[?#]|$)/.test(router.url) || !canGoBack) {
          void App.minimizeApp();
        } else if (['/tasks', '/contacts', '/import'].some((path) => router.url.startsWith(path))) {
          void router.navigateByUrl('/calendar');
        } else window.history.back();
      }),
    ];
    const updateBars = () => void SystemBars.setStyle({ style:
      document.documentElement.classList.contains('dark') ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => undefined);
    const observer = new MutationObserver(updateBars);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    updateBars();
    const openExternal = (href: string): boolean => {
      try {
        const url = new URL(href, window.location.href);
        if (!['https:', 'http:'].includes(url.protocol) || url.origin === window.location.origin) return false;
        void Browser.open({ url: url.href, toolbarColor: '#2563eb' }).catch(() => undefined);
        return true;
      } catch { return false; }
    };
    const originalOpen = window.open;
    window.open = ((url?: string | URL, ...args: any[]) => {
      if (url && openExternal(String(url))) return null;
      return originalOpen.call(window, url, ...args);
    }) as typeof window.open;
    const click = (event: MouseEvent) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a[href]') : null;
      if (anchor instanceof HTMLAnchorElement && openExternal(anchor.href)) event.preventDefault();
    };
    document.addEventListener('click', click, true);
    destroy.onDestroy(() => {
      for (const handle of handles) void handle.then((listener) => listener.remove());
      observer.disconnect();
      window.removeEventListener('online', resume);
      document.removeEventListener('click', click, true);
      window.open = originalOpen;
      notifications.onOpen = null;
    });
  }
}
