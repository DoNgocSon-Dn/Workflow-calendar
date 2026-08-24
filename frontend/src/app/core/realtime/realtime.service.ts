import { Injectable, computed, inject, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth-store';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authStore = inject(AuthStore);
  private socket: Socket | null = null;

  /** Số lần socket bắt tay thành công. Dùng `update` chứ không `set` vì giá trị
   *  mới suy ra từ giá trị cũ — đúng chỗ để tăng dần. */
  private readonly connectCount = signal(0);

  /** Trạng thái hiện tại. Dùng `set` vì socket báo thẳng "đang nối/đã đứt",
   *  không cần biết giá trị trước đó là gì. */
  private readonly connectedState = signal(false);

  private readonly reconnectHandlers: Array<() => void> = [];

  /** Real-time còn sống hay không. */
  readonly connected = this.connectedState.asReadonly();

  /** Đã bắt tay được ít nhất một lần. Trước thời điểm đó, `connected === false`
   *  chỉ có nghĩa là "đang kết nối lần đầu", KHÔNG phải "mất kết nối" — thiếu
   *  phân biệt này thì lúc mới tải trang banner cảnh báo sẽ nháy lên oan. */
  readonly hasConnectedOnce = computed(() => this.connectCount() > 0);

  /** Chỉ báo động khi thật sự đứt: đã từng nối được, rồi mới mất. */
  readonly disconnected = computed(() => this.hasConnectedOnce() && !this.connectedState());

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

    // Một listener 'connect' DUY NHẤT ở đây điều phối tất cả: cập nhật trạng
    // thái rồi gọi các handler re-sync. Nếu để mỗi store tự đăng ký listener
    // 'connect' riêng cho việc này thì lại sinh ra đúng cái subscription trùng
    // mà kiến trúc đang tránh.
    this.socket.on('connect', () => {
      // Đọc TRƯỚC khi tăng: lần bắt tay đầu tiên không phải là "nối lại".
      const isReconnect = this.connectCount() > 0;
      this.connectCount.update((count) => count + 1);
      this.connectedState.set(true);

      if (isReconnect) {
        for (const handler of this.reconnectHandlers) handler();
      }
    });

    this.socket.on('disconnect', () => this.connectedState.set(false));
    this.socket.on('connect_error', () => this.connectedState.set(false));
  }

  joinCalendar(calendarId: string): void {
    this.socket?.emit('joinCalendar', { calendarId });
  }

  onConnect(handler: () => void): void {
    this.socket?.on('connect', handler);
  }

  /** Chạy mỗi khi kết nối LẠI (không chạy ở lần kết nối đầu). Dùng để tải lại
   *  những gì đã bỏ lỡ lúc mất mạng. Không tạo listener socket mới — chỉ thêm
   *  vào danh sách do listener 'connect' chung ở trên gọi. */
  onReconnect(handler: () => void): void {
    this.reconnectHandlers.push(handler);
  }

  on<T>(event: string, handler: (payload: T) => void): void {
    this.socket?.on(event, handler);
  }

  off<T>(event: string, handler: (payload: T) => void): void {
    this.socket?.off(event, handler);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.connectedState.set(false);
  }
}
