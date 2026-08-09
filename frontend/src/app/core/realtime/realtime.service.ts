import { Injectable, inject } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth-store';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authStore = inject(AuthStore);
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket?.connected) return;
    this.socket = io(environment.apiUrl, {
      auth: { token: this.authStore.accessToken() },
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
    this.socket = null;
  }
}
