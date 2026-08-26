import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Một lượt nhắc tên trong tin nhắn. `type: 'all'` là @All (cả nhóm) nên
 *  không kèm userId; `type: 'user'` bắt buộc có userId để biết chính xác ai
 *  được nhắc mà không phải dò chuỗi trong nội dung. */
export class MessageMentionDto {
  @IsIn(['user', 'all'])
  type!: 'user' | 'all';

  /** Chỉ có với type='user'. Backend còn lọc lại theo danh sách thành viên
   *  thật của nhóm trước khi lưu (xem GroupsService.sanitizeMentions). */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Tên hiển thị tại thời điểm gửi — dùng để tô đúng đoạn "@..." trong nội
   *  dung kể cả sau khi người đó đổi tên. */
  @IsString()
  @MaxLength(120)
  label!: string;
}

export class SendGroupMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  /** Giới hạn 50 để một tin nhắn không thể biến thành cỗ máy spam thông báo. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MessageMentionDto)
  mentions?: MessageMentionDto[];

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentName?: string;

  @IsOptional()
  @IsString()
  attachmentType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  attachmentSize?: number;
}
