import { IsIn } from 'class-validator';

export class DecideJoinRequestDto {
  @IsIn(['approved', 'declined'])
  status!: 'approved' | 'declined';
}
