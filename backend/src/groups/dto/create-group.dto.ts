import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateGroupDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['blue', 'green', 'orange', 'red', 'purple', 'teal'])
  color?: string;

  /** Mặc định true (an toàn hơn). Tắt = ai nhập đúng mã nhóm là vào ngay. */
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}
