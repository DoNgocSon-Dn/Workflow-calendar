import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateGroupMessageDto {
  @IsNotEmpty()
  @IsString()
  message: string;
}
