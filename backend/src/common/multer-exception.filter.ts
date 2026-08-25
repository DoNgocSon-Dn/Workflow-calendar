import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';
import { MAX_UPLOAD_LABEL } from './limits';

/**
 * Dịch lỗi tải file thành phản hồi rõ ràng, đúng ngôn ngữ người dùng.
 *
 * Bắt CẢ HAI kiểu vì `@nestjs/platform-express` đã dịch sẵn một phần: hàm
 * `transformException` đổi `LIMIT_FILE_SIZE` thành `PayloadTooLargeException`
 * với thông báo tiếng Anh "File too large" TRƯỚC khi filter chạy — nên chỉ bắt
 * `MulterError` là không bao giờ chạm tới ca vượt dung lượng, mà đó lại là ca
 * hay xảy ra nhất. Các mã còn lại vẫn tới đây dưới dạng `MulterError` thô.
 *
 * Mục đích: người dùng biết giới hạn là bao nhiêu, và không có chi tiết nội bộ
 * nào rò ra ngoài.
 */
@Catch(MulterError, PayloadTooLargeException)
export class MulterExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MulterExceptionFilter.name);

  catch(error: MulterError | PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const isTooLarge =
      error instanceof PayloadTooLargeException ||
      (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE');

    if (isTooLarge) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: `File vượt quá giới hạn ${MAX_UPLOAD_LABEL}.`,
        error: 'Payload Too Large',
      });
      return;
    }

    // Các mã còn lại (quá nhiều file, sai tên field...) đều là request dựng
    // sai. Ghi log để còn lần ra, nhưng chỉ trả câu chung ra ngoài.
    this.logger.warn(`Lỗi tải file (${(error as MulterError).code}): ${error.message}`);
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'File tải lên không hợp lệ.',
      error: 'Bad Request',
    });
  }
}
