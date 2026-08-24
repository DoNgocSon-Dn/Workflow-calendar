import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AiChatHistoryEntryDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
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
}
