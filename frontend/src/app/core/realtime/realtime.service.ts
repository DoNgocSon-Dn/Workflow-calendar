import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth-store';

/** Vào phòng hỏng thì thử lại mấy lần, giãn dần. Một lần join trượt mà im
 *  lặng bỏ qua nghĩa là MỌI realtime của lịch đó tắt hẳn cho tới lần F5 kế
 *  tiếp — hỏng nặng mà không có dấu hiệu nào. */
const JOIN_MAX_ATTEMPTS = 4;
const JOIN_RETRY_MS = 400;

interface EventListenerReg {
  event: string;
  handler: (payload: any) => void;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authStore = inject(AuthStore);
  private socket: Socket | null = null;
  private currentToken: string | null = null;

  /** Số lần socket bắt tay thành công. Dùng `update` chứ không `set` vì giá trị
   *  mới suy ra từ giá trị cũ — đúng chỗ để tăng dần. */
  private readonly connectCount = signal(0);

  /** Trạng thái hiện tại. Dùng `set` vì socket báo thẳng "đang nối/đã đứt",
   *  không cần biết giá trị trước đó là gì. */
  private readonly connectedState = signal(false);

  private readonly reconnectHandlers: Array<() => void> = [];
  private readonly connectHandlers: Array<() => void> = [];
  private readonly listeners: EventListenerReg[] = [];
  private readonly joinedRooms = new Set<string>();

  /** Real-time còn sống hay không. */
  readonly connected = this.connectedState.asReadonly();

  /** Đã bắt tay được ít nhất một lần. Trước thời điểm đó, `connected === false`
   *  chỉ có nghĩa là "đang kết nối lần đầu", KHÔNG phải "mất kết nối". */
  readonly hasConnectedOnce = computed(() => this.connectCount() > 0);

  /** Chỉ báo động khi thật sự đứt: đã từng nối được, rồi mới mất. */
  readonly disconnected = computed(() => this.hasConnectedOnce() && !this.connectedState());

  constructor() {
    effect(() => {
      const token = this.authStore.accessToken();
      if (token && token !== this.currentToken) {
        this.reconnectWithToken(token);
      } else if (!token && this.socket) {
        this.disconnect();
      }
    });
  }

  connect(): void {
    const token = this.authStore.accessToken();
    if (!token) return;
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }
    this.reconnectWithToken(token);
  }

  private reconnectWithToken(token: string): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.socket = io(environment.apiUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    for (const { event, handler } of this.listeners) {
      this.socket.on(event, handler);
    }

    this.socket.on('connect', () => {
      const isReconnect = this.connectCount() > 0;
      this.connectCount.update((count) => count + 1);
      this.connectedState.set(true);

      for (const roomId of this.joinedRooms) {
        this.emitJoin(roomId);
      }

      for (const handler of this.connectHandlers) handler();
      if (isReconnect) {
        for (const handler of this.reconnectHandlers) handler();
      }
    });

    this.socket.on('disconnect', () => this.connectedState.set(false));
    this.socket.on('connect_error', () => this.connectedState.set(false));
  }

  joinCalendar(calendarId: string): void {
    if (!calendarId) return;
    this.joinedRooms.add(calendarId);
    if (this.socket?.connected) {
      this.emitJoin(calendarId);
    }
  }

  /** Gửi joinCalendar và ĐỌC ack. Server trả { ok, error } — trước đây ack bị
   *  bỏ qua hoàn toàn nên một lần từ chối là mất realtime trong im lặng. */
  private emitJoin(calendarId: string, attempt = 1): void {
    this.socket?.emit(
      'joinCalendar',
      { calendarId },
      (ack?: { ok?: boolean; error?: string }) => {
        if (ack?.ok) return;
        if (attempt >= JOIN_MAX_ATTEMPTS) {
          console.warn(
            `Không vào được phòng realtime của lịch ${calendarId} (${ack?.error ?? 'không phản hồi'}). ` +
              'Sự kiện thời gian thực của lịch này sẽ không tới.',
          );
          return;
        }
        setTimeout(() => {
          // Mất kết nối giữa chừng thì thôi — handler 'connect' sẽ join lại từ đầu.
          if (this.socket?.connected) this.emitJoin(calendarId, attempt + 1);
        }, JOIN_RETRY_MS * attempt);
      },
    );
  }

  onConnect(handler: () => void): void {
    this.connectHandlers.push(handler);
    if (this.socket?.connected) {
      handler();
    }
  }

  onReconnect(handler: () => void): void {
    this.reconnectHandlers.push(handler);
  }

  on<T>(event: string, handler: (payload: T) => void): void {
    this.listeners.push({ event, handler: handler as (payload: any) => void });
    this.socket?.on(event, handler as (payload: any) => void);
  }

  off<T>(event: string, handler: (payload: T) => void): void {
    const idx = this.listeners.findIndex((l) => l.event === event && l.handler === handler);
    if (idx !== -1) this.listeners.splice(idx, 1);
    this.socket?.off(event, handler as (payload: any) => void);
  }

  disconnect(): void {
    this.currentToken = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectedState.set(false);
  }
}
