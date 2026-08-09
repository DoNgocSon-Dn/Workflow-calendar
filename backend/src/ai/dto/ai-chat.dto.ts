import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsUUID()
  calendarId!: string;
}
