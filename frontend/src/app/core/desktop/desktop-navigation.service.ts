import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { DesktopAlert, desktopBridge } from './desktop-bridge';
import { AuthStore } from '../auth/auth-store';
import { isAndroidApp } from '../mobile/mobile-platform';

/** Holds native clicks across route changes and asynchronous calendar loading. */
@Injectable({ providedIn: 'root' })
export class DesktopNavigationService {
  private readonly bridge = desktopBridge();
  private readonly pendingState = signal<DesktopAlert | null>(null);
  readonly pending = this.pendingState.asReadonly();
  private router?: Router;

  constructor() {
    if (!this.bridge && !isAndroidApp()) return;
    const router = inject(Router);
    this.router = router;
    const auth = inject(AuthStore);
    let previousUser = auth.user()?.id ?? null;
    effect(() => {
      const user = auth.user()?.id ?? null;
      if (previousUser && user !== previousUser) {
        untracked(() => this.pendingState.set(null));
      }
      previousUser = user;
    });
    if (!this.bridge) return;
    const detachClick = this.bridge.onNotificationClick((alert) => {
      this.open(alert);
    });
    const detachCancelled = this.bridge.onNotificationCancelled((id) => {
      if (this.pendingState()?.id === id) this.pendingState.set(null);
    });
    inject(DestroyRef).onDestroy(() => {
      detachClick();
      detachCancelled();
    });
  }

  open(alert: DesktopAlert): void {
    this.pendingState.set(alert);
    const destination = alert.peerId ? '/contacts' : '/calendar';
    if (this.router?.url.split(/[?#]/)[0] !== destination) {
      void this.router?.navigateByUrl(destination).catch(() => undefined);
    }
  }

  complete(id: string): void {
    if (this.pendingState()?.id !== id) return;
    this.pendingState.set(null);
    void this.bridge?.acknowledgeNotificationClick(id).catch(() => undefined);
  }
}
