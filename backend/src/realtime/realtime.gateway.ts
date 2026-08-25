import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

interface SocketData {
  user: User;
  supabase: SupabaseClient;
}

type AppSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  SocketData
>;

function roomName(calendarId: string): string {
  return `calendar:${calendarId}`;
}

function userRoomName(userId: string): string {
  return `user:${userId}`;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly supabaseService: SupabaseService) {}

  async handleConnection(client: AppSocket): Promise<void> {
    const token = client.handshake.auth?.['token'] as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    const { data, error } = await this.supabaseService
      .getAnonClient()
      .auth.getUser(token);
    if (error || !data.user) {
      client.disconnect();
      return;
    }

    client.data.user = data.user;
    client.data.supabase = this.supabaseService.getClientForToken(token);
    await client.join(userRoomName(data.user.id));
    console.log(`[realtime] connected user=${data.user.email} socket=${client.id}`);

    client.on('disconnect', (reason) => {
      console.log(`[realtime] disconnected user=${data.user.email} socket=${client.id} reason=${reason}`);
    });
  }

  @SubscribeMessage('joinCalendar')
  async joinCalendar(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: { calendarId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!payload?.calendarId) return { ok: false, error: 'invalid_id' };

    const supabase = client.data?.supabase ?? this.supabaseService.getAnonClient();

    const { data: cal } = await supabase
      .from('calendars')
      .select('id')
      .eq('id', payload.calendarId)
      .maybeSingle();

    let isAuthorized = !!cal;

    if (!isAuthorized) {
      const { data: grp } = await supabase
        .from('groups')
        .select('id')
        .eq('id', payload.calendarId)
        .maybeSingle();
      isAuthorized = !!grp;
    }

    if (!isAuthorized) {
      return { ok: false, error: 'forbidden' };
    }

    await client.join(roomName(payload.calendarId));
    console.log(
      `[realtime] user=${client.data.user?.email} joined room=${roomName(payload.calendarId)}`,
    );
    return { ok: true };
  }

  @SubscribeMessage('leaveCalendar')
  leaveCalendar(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: { calendarId: string },
  ): void {
    void client.leave(roomName(payload.calendarId));
  }

  emitToCalendar(calendarId: string, event: string, payload: unknown): void {
    const room = roomName(calendarId);
    const size = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    console.log(`[realtime] emit "${event}" -> room=${room} (${size} socket(s))`);
    this.server.to(room).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(userRoomName(userId)).emit(event, payload);
  }

  /** Gửi tới mọi client đang kết nối — dùng cho thông báo hệ thống dạng
   *  broadcast (bảo trì, sự cố...). */
  broadcast(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }
}
