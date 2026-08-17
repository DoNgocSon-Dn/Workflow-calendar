import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GoogleSigninButtonModule, SocialAuthService, SocialUser } from '@abacritt/angularx-social-login';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';

type ConnectionStatus = 'idle' | 'connecting' | 'success' | 'error';

interface SocketAuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_ID_TOKEN: 'Không nhận được idToken từ Google.',
  EXPIRED_ID_TOKEN: 'Token Google đã hết hạn, vui lòng đăng nhập lại.',
  INVALID_ID_TOKEN: 'Token Google không hợp lệ.',
  AUTH_FAILED: 'Xác thực thất bại, vui lòng thử lại.',
};

@Component({
  selector: 'app-google-socket-login',
  templateUrl: './google-socket-login.html',
  styleUrls: ['./google-socket-login.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GoogleSigninButtonModule],
})
export class GoogleSocketLogin {
  private readonly socialAuthService = inject(SocialAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private socket: Socket | null = null;

  readonly status = signal<ConnectionStatus>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly appJwt = signal<string | null>(null);
  readonly socketUser = signal<SocketAuthUser | null>(null);

  constructor() {
    this.socialAuthService.authState
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => this.handleGoogleUser(user));

    this.destroyRef.onDestroy(() => this.socket?.disconnect());
  }

  private handleGoogleUser(user: SocialUser | null): void {
    if (!user?.idToken) return;
    this.connectSocket(user.idToken);
  }

  private connectSocket(idToken: string): void {
    this.socket?.disconnect();
    this.status.set('connecting');
    this.errorMessage.set(null);

    // Auth happens during the handshake (io.use() on the server) — a bad
    // token rejects the connection itself, so we never get a live socket.
    const socket = io(environment.socketAuthUrl, {
      auth: { idToken },
      reconnection: false,
    });
    this.socket = socket;

    socket.on('auth:success', (payload: { token: string; user: SocketAuthUser }) => {
      this.status.set('success');
      this.appJwt.set(payload.token);
      this.socketUser.set(payload.user);
    });

    socket.on('connect_error', (err: Error) => {
      this.status.set('error');
      this.errorMessage.set(ERROR_MESSAGES[err.message] ?? 'Không thể kết nối máy chủ xác thực.');
    });

    socket.on('disconnect', (reason: Socket.DisconnectReason) => {
      if (this.status() !== 'success') return;
      if (reason === 'io server disconnect' || reason === 'io client disconnect') return;
      this.status.set('error');
      this.errorMessage.set('Mất kết nối tới máy chủ, vui lòng thử lại.');
    });
  }
}
