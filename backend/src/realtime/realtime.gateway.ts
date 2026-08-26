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
  /** Xác thực xong hay chưa. Xem chú thích ở handleConnection. */
  ready: Promise<void>;
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

  /**
   * Xác thực socket vừa kết nối.
   *
   * Gán `client.data.ready` NGAY trong nhánh đồng bộ, trước mọi `await`.
   *
   * Socket.IO báo 'connect' cho client ngay khi bắt tay xong, không chờ hàm này
   * chạy hết — mà việc xác thực phải gọi sang Supabase nên mất vài trăm mili
   * giây. Client lại join phòng ngay trong handler 'connect', nên message
   * joinCalendar tới nơi khi `client.data.supabase` còn undefined. Trước đây
   * nó lặng lẽ rơi về anon client, RLS trả về rỗng, và join bị từ chối là
   * "forbidden" — hệ quả là KHÔNG phòng lịch nào được tham gia và toàn bộ
   * realtime của lịch (event:created/updated/deleted, nhắc lịch, lời mời) im
   * lặng biến mất. Giữ promise ở đây để joinCalendar chờ đúng lúc.
   */
  handleConnection(client: AppSocket): void {
    client.data.ready = this.authenticate(client);
    // Lỗi đã được nuốt bên trong authenticate; bắt ở đây chỉ để promise không
    // thành unhandled rejection khi joinCalendar không bao giờ được gọi.
    void client.data.ready.catch(() => undefined);
  }

  private async authenticate(client: AppSocket): Promise<void> {
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
    if (!payload?.calendarId) return { ok: false, error: 'invalid_id' };

    // Chờ xác thực xong. Không có bước này thì join tới trước lúc có supabase
    // của người dùng và luôn hỏng.
    await client.data?.ready;

    const supabase = client.data?.supabase;
    // KHÔNG rơi về anon client: anon không đọc được gì qua RLS nên câu trả lời
    // sẽ là "forbidden" giả, che mất lỗi thật là chưa xác thực.
    if (!supabase) return { ok: false, error: 'unauthorized' };

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

  /** Gửi tới mọi client đang kết nối — dùng cho thông báo hệ thống dạng
   *  broadcast (bảo trì, sự cố...). */
  broadcast(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }
}
