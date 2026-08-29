/**
 * Giới hạn tài nguyên dùng chung cho các endpoint nhận file hoặc payload lớn.
 *
 * Gom về một chỗ để mỗi con số chỉ có MỘT nguồn sự thật: thông báo lỗi hiển thị
 * cho người dùng, kiểm tra ở multer, kiểm tra ở service và kiểm tra sớm phía
 * frontend đều phải nói cùng một con số.
 */

/** Dung lượng tối đa cho mỗi file tải lên (.ics, .csv, .xlsx, .docx, .pdf). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Giá trị truyền cho `multer.limits.fileSize`.
 *
 * PHẢI là MAX_UPLOAD_BYTES + 1. Busboy phát tín hiệu vượt giới hạn ngay khi
 * `fileSize === fileSizeLimit` (busboy/lib/types/multipart.js), nên truyền
 * thẳng MAX_UPLOAD_BYTES sẽ từ chối cả file đúng bằng 10 MB — lệch một byte so
 * với điều người dùng được hứa.
 */
export const MULTER_FILE_SIZE_LIMIT = MAX_UPLOAD_BYTES + 1;

/** Nhãn hiển thị, tránh việc mỗi nơi tự đổi byte sang MB một kiểu. */
export const MAX_UPLOAD_LABEL = '10 MB';

/** Số sự kiện tối đa đọc được từ MỘT file import. */
export const MAX_IMPORT_EVENTS = 500;

/** Số sự kiện tối đa cho MỘT lần gọi /events/bulk-create. */
export const MAX_BULK_CREATE_EVENTS = 500;

/** Đuôi file hợp lệ cho import chuẩn. */
export const ALLOWED_IMPORT_EXTENSIONS = ['.ics', '.csv'] as const;

/**
 * Đuôi file hợp lệ cho Trợ lý AI đọc tài liệu.
 *
 * Trùng .ics/.csv với ALLOWED_IMPORT_EXTENSIONS là CỐ Ý: cùng một file lịch có
 * thể đưa vào Import Lịch (đọc theo đúng chuẩn, nhanh, không cần mạng) hoặc
 * đưa cho Trợ lý AI (hiểu được file trình bày tự do). Hai đường phục vụ hai
 * nhu cầu khác nhau, không phải một cái thay thế cái kia.
 *
 * PDF qua pdf.js, Word (.docx) qua mammoth, Excel (.xlsx) qua xlsx —
 * xem AiFileImportService.extractTextFromFile.
 */
export const ALLOWED_AI_FILE_EXTENSIONS = [
  '.ics',
  '.csv',
  '.pdf',
  '.docx',
  '.xlsx',
] as const;

/** Nhãn hiển thị cho danh sách định dạng Trợ lý AI đọc được. */
export const AI_FILE_FORMATS_LABEL = '.ics, .csv, .pdf, .docx, .xlsx';

/**
 * Hạn mức cho các thao tác nặng: 10 lượt mỗi giờ.
 *
 * Dùng để GHI ĐÈ throttler tên 'default' ngay tại từng handler, đúng cách các
 * route AI đang làm. Không khai báo thêm throttler có tên mới: ThrottlerGuard
 * duyệt MỌI throttler đã đăng ký cho MỌI route, nên thêm một cái tên mới đồng
 * nghĩa áp hạn mức đó lên toàn bộ API (xem chú thích trong app.module.ts).
 *
 * Quota vẫn tách bạch giữa các route vì khoá lưu trữ của throttler được sinh từ
 * `TênClass-TênHandler-TênThrottler-người gọi`, nên Import, Bulk Create và AI
 * mỗi cái đếm riêng dù cùng ghi đè tên 'default'.
 */
export const HEAVY_OPERATION_RATE_LIMIT = {
  limit: 10,
  ttl: 60 * 60 * 1000,
} as const;

/** Kiểm tra đuôi file, không tin `mimetype` do client gửi. */
export function hasAllowedExtension(
  filename: string,
  allowed: readonly string[],
): boolean {
  const lower = filename.toLowerCase();
  return allowed.some((ext) => lower.endsWith(ext));
}
