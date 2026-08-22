import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SendGroupMessageDto {
  @IsOptional()
  @IsString()
  message?: string;

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
