import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { DesktopAlert, desktopBridge } from './desktop-bridge';
import { AuthStore } from '../auth/auth-store';

/** Holds native clicks across route changes and asynchronous calendar loading. */
@Injectable({ providedIn: 'root' })
export class DesktopNavigationService {
  private readonly bridge = desktopBridge();
  private readonly pendingState = signal<DesktopAlert | null>(null);
  readonly pending = this.pendingState.asReadonly();

  constructor() {
    if (!this.bridge) return;
    const router = inject(Router);
    const auth = inject(AuthStore);
    let previousUser = auth.user()?.id ?? null;
    effect(() => {
      const user = auth.user()?.id ?? null;
      if (previousUser && user !== previousUser) {
        untracked(() => this.pendingState.set(null));
      }
      previousUser = user;
    });
    const detachClick = this.bridge.onNotificationClick((alert) => {
      this.pendingState.set(alert);
      // The guard retains the destination if the user must sign in first.
      if (router.url.split(/[?#]/)[0] !== '/calendar') {
        void router.navigateByUrl('/calendar').catch(() => undefined);
      }
    });
    const detachCancelled = this.bridge.onNotificationCancelled((id) => {
      if (this.pendingState()?.id === id) this.pendingState.set(null);
    });
    inject(DestroyRef).onDestroy(() => {
      detachClick();
      detachCancelled();
    });
  }

  complete(id: string): void {
    if (this.pendingState()?.id !== id) return;
    this.pendingState.set(null);
    void this.bridge?.acknowledgeNotificationClick(id).catch(() => undefined);
  }
}
