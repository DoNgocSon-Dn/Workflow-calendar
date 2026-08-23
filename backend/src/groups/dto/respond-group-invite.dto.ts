import { IsIn } from 'class-validator';

export class RespondGroupInviteDto {
  @IsIn(['accepted', 'declined'])
  status!: 'accepted' | 'declined';
}
