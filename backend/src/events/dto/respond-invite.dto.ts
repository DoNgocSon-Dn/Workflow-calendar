import { IsIn } from 'class-validator';

export class RespondInviteDto {
  @IsIn(['accepted', 'declined'])
  status!: 'accepted' | 'declined';
}
