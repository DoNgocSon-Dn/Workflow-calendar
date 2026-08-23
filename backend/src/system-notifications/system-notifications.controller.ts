import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateSystemNotificationDto } from './dto/create-system-notification.dto';

/**
 * Phát thông báo hệ thống qua Socket.IO.
 *
 * KHÔNG dùng SupabaseAuthGuard: đây là kênh vận hành (bảo trì, sự cố), không
 * phải hành động của người dùng thường. Bảo vệ bằng header `x-system-token`
 * khớp với biến môi trường `SYSTEM_NOTIFICATION_TOKEN`. Chưa đặt biến này thì
 * endpoint bị tắt hẳn — không ai broadcast được cho toàn bộ người dùng.
 */
@Controller('system-notifications')
export class SystemNotificationsController {
  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  send(
    @Headers('x-system-token') token: string | undefined,
    @Body() dto: CreateSystemNotificationDto,
  ) {
    const expected = this.configService.get<string>('systemNotificationToken');
    if (!expected) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình SYSTEM_NOTIFICATION_TOKEN — endpoint thông báo hệ thống đang tắt.',
      );
    }
    if (token !== expected) {
      throw new ForbiddenException('Token không hợp lệ');
    }

    const notification = {
      id: randomUUID(),
      title: dto.title,
      message: dto.message,
      level: dto.level ?? 'info',
      createdAt: new Date().toISOString(),
    };

    if (dto.targetUserId) {
      this.realtimeGateway.emitToUser(dto.targetUserId, 'system:notice', {
        notification,
      });
    } else {
      this.realtimeGateway.broadcast('system:notice', { notification });
    }

    return { delivered: true, notification };
  }
}
