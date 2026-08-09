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
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
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
  }

  @SubscribeMessage('joinCalendar')
  async joinCalendar(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: { calendarId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const { data } = await client.data.supabase
      .from('calendars')
      .select('id')
      .eq('id', payload.calendarId)
      .maybeSingle();

    if (!data) {
      return { ok: false, error: 'forbidden' };
    }

    await client.join(roomName(payload.calendarId));
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
    this.server.to(roomName(calendarId)).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(userRoomName(userId)).emit(event, payload);
  }
}
