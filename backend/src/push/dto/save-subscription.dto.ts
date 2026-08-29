import { Type } from 'class-transformer';
import { IsDefined, IsString, MaxLength, ValidateNested } from 'class-validator';

export class PushKeysDto {
  @IsString()
  @MaxLength(255)
  p256dh!: string;

  @IsString()
  @MaxLength(255)
  auth!: string;
}

export class SaveSubscriptionDto {
  /** URL do push service cấp (FCM/Mozilla/Apple). Duy nhất cho mỗi đăng ký. */
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
