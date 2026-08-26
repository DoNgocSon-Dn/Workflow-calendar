import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * ThrottlerGuard mặc định tính hạn mức theo IP (`req.ip`) — nghĩa là mọi
 * người dùng chung mạng/NAT (wifi công ty, quán cà phê...) DÙNG CHUNG một
 * hạn mức: người này import nhiều là người khác cũng bị chặn theo, dù khác
 * hẳn tài khoản.
 *
 * Đổi sang tính theo user id lấy trực tiếp từ claim `sub` của JWT, KHÔNG xác
 * thực chữ ký ở đây, vì hai lý do:
 *  - ThrottlerGuard được đăng ký làm APP_GUARD (global) nên luôn chạy TRƯỚC
 *    SupabaseAuthGuard (guard ở tầng controller) — tại thời điểm này
 *    `req.user` chưa được gắn, không có gì để đọc.
 *  - Token giả/sai chữ ký vẫn bị SupabaseAuthGuard từ chối bằng 401 ngay sau
 *    đó như bình thường — dùng nhầm một khoá đếm không phải lỗ hổng bảo mật,
 *    chỉ ảnh hưởng đúng người tự gửi token giả.
 *
 * Không có token (route công khai, ví dụ public-respond) thì rơi về IP như
 * hành vi mặc định cũ.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return decodeJwtSubject(req.headers.authorization) ?? req.ip ?? 'unknown';
  }
}

function decodeJwtSubject(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = authHeader.slice('Bearer '.length).split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
    };
    return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}
