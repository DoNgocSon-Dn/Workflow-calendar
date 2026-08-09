import { IsEmail } from 'class-validator';

export class InviteAttendeeDto {
  @IsEmail()
  email!: string;
}
