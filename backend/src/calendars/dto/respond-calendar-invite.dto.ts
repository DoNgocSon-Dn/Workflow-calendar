import { IsIn } from 'class-validator';

export class RespondCalendarInviteDto {
  @IsIn(['accepted', 'declined'])
  status!: 'accepted' | 'declined';
}
