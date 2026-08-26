import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateGroupMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  message: string;
}
