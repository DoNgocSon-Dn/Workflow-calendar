import { IsEmail, IsOptional } from 'class-validator';

export class TestSendMailDto {
  @IsOptional()
  @IsEmail()
  to?: string;
}
