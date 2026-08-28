import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AiLastRelevantEntity } from '../ai.service';

export class AiChatHistoryEntryDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export type AiPendingActionType = 'note' | 'todo' | 'event' | 'group';

/**
 * Một hành động AI đang CHỜ người dùng cung cấp thêm thông tin (nội dung ghi
 * chú, ngày/giờ sự kiện, email thành viên...) trước khi thực hiện được.
 *
 * Backend KHÔNG lưu trạng thái này ở server (stateless giữa các request,
 * giống hệt `history` bên dưới) — client tự giữ `pendingAction` mà backend
 * trả về và GỬI LẠI NGUYÊN VẸN ở lượt kế tiếp. Nhờ vậy backend biết chắc câu
 * trả lời tiếp theo là dữ liệu điền vào field đang thiếu, không phải một yêu
 * cầu mới độc lập — xem `AiController.chat()`/`resumePendingAction()`.
 */
export class AiPendingActionDto {
  @IsIn(['note', 'todo', 'event', 'group'])
  type!: AiPendingActionType;

  /** Tên field còn thiếu — vd 'content', 'date', 'time', 'member_email',
   *  'member_name_or_email', 'group_name'. */
  @IsString()
  @IsNotEmpty()
  missingField!: string;

  /** Dữ liệu đã thu thập được từ (các) lượt trước, gộp dần cho tới khi đủ. */
  @IsOptional()
  @IsObject()
  collected?: Record<string, unknown>;
}

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsUUID()
  calendarId!: string;

  /** Vài lượt chat gần nhất trong phiên hiện tại — giúp AI hiểu ngữ cảnh khi
   *  người dùng hỏi tiếp ("còn ngày mai thì sao?") thay vì chỉ xử lý câu đơn lẻ. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AiChatHistoryEntryDto)
  history?: AiChatHistoryEntryDto[];

  /** Có mặt khi lượt CHAT TRƯỚC ĐÓ backend trả về một `pendingAction` (đang
   *  hỏi thêm thông tin) — client echo nguyên vẹn lại đây để backend ưu tiên
   *  xử lý tiếp action đang chờ TRƯỚC KHI chạy intent detection từ đầu. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AiPendingActionDto)
  pendingAction?: AiPendingActionDto;

  /** Entity gần nhất AI vừa thao tác thành công (tạo/sửa/xoá) — client echo
   *  lại đây để backend truyền vào Gemini context, giúp AI resolve tham chiếu
   *  "nó"/"cái đó" mà không cần hỏi lại. Optional để không phá client cũ. */
  @IsOptional()
  @IsObject()
  lastRelevantEntity?: AiLastRelevantEntity;
}
