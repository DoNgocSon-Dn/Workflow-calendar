import { Injectable, inject } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth-store';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authStore = inject(AuthStore);
  private socket: Socket | null = null;

  // Reuses a single Socket instance for the tab's lifetime instead of
  // recreating it on every connect() — listeners registered by stores
  // (GroupStore, CalendarStore, ...) must stay bound across reconnects
  // (e.g. the auth-driven disconnect/reconnect during session restore),
  // otherwise they end up attached to a discarded socket and silently stop
  // receiving events.
  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }
    this.socket = io(environment.apiUrl, {
      auth: (cb) => cb({ token: this.authStore.accessToken() }),
    });
  }

  joinCalendar(calendarId: string): void {
    this.socket?.emit('joinCalendar', { calendarId });
  }

  onConnect(handler: () => void): void {
    this.socket?.on('connect', handler);
  }

  on<T>(event: string, handler: (payload: T) => void): void {
    this.socket?.on(event, handler);
  }

  off<T>(event: string, handler: (payload: T) => void): void {
    this.socket?.off(event, handler);
  }

  disconnect(): void {
    this.socket?.disconnect();
  }
}
