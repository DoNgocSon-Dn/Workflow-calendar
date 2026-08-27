import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { CreateNoteDto } from './create-note.dto';

export class UpdateNoteDto extends PartialType(CreateNoteDto) {
  /** Ngày ghi chú được "dán" lên lịch (kéo-thả vào một ô ngày) — chỉ ngày,
   *  không giờ, dạng "YYYY-MM-DD". */
  @IsOptional()
  @IsDateString()
  pinnedDate?: string;

  /** Gỡ ghi chú khỏi lịch. Cần cờ riêng vì không thể phân biệt "không đổi"
   *  và "gỡ hẳn" chỉ bằng pinnedDate undefined — giống clearDueAt của Todo. */
  @IsOptional()
  @IsBoolean()
  clearPinnedDate?: boolean;
}
