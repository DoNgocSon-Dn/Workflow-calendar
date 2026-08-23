import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSystemNotificationDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsIn(['info', 'warning', 'maintenance'])
  level?: 'info' | 'warning' | 'maintenance';

  /** Bỏ trống = broadcast cho mọi client đang kết nối. */
  @IsOptional()
  @IsUUID()
  targetUserId?: string;
}
