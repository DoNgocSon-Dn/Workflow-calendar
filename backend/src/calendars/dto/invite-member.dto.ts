import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['editor', 'viewer'])
  role?: 'editor' | 'viewer';
}
