import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Kiểm tra xem một chuỗi lỗi hoặc đối tượng lỗi có xuất phát từ việc Supabase
 * / Cloudflare bị quá thời gian chờ (522, 524, 504, timeout, fetch failed) hay không.
 */
export function isSupabaseTimeoutError(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('522') ||
    lower.includes('524') ||
    lower.includes('504') ||
    lower.includes('520') ||
    lower.includes('521') ||
    lower.includes('connection timed out') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('cloudflare') ||
    lower.includes('<!doctype') ||
    lower.includes('<html') ||
    lower.includes('canceling statement due to statement timeout')
  );
}

export const SUPABASE_TIMEOUT_USER_MESSAGE =
  'Lỗi: Cơ sở dữ liệu Supabase bị quá thời gian chờ (Supabase Database Timeout). Vui lòng kiểm tra lại trạng thái Supabase hoặc thử lại sau giây lát.';

/**
 * Global Exception Filter:
 * Bắt toàn bộ lỗi HTTP và lỗi không mong muốn trong toàn bộ ứng dụng Backend.
 * Đặc biệt nhận diện chính xác các lỗi timeout / ngắt kết nối từ Supabase/Cloudflare
 * và trả về thông báo rõ ràng cho người dùng thay vì mã lỗi HTML hoặc 500 mơ hồ.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Đã xảy ra lỗi trên hệ thống.';
    let errorType = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as { message?: string | string[]; error?: string };
        if (resObj.message) message = resObj.message;
        if (resObj.error) errorType = resObj.error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const messageStr = Array.isArray(message) ? message.join('; ') : String(message);

    // Kiểm tra xem lỗi có phải do Supabase Timeout / Cloudflare 522/524 không
    if (isSupabaseTimeoutError(messageStr)) {
      this.logger.error(`[Supabase Timeout Detected]: ${messageStr}`);
      response.status(HttpStatus.GATEWAY_TIMEOUT).json({
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        message: SUPABASE_TIMEOUT_USER_MESSAGE,
        error: 'Gateway Timeout',
      });
      return;
    }

    if (status >= 500) {
      this.logger.error(
        `[Internal Server Error]: ${messageStr}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: errorType,
    });
  }
}
