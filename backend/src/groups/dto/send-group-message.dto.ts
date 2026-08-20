import { IsNotEmpty, IsString } from 'class-validator';

export class SendGroupMessageDto {
  @IsNotEmpty()
  @IsString()
  message: string;
}
