import { IsEmail, MaxLength } from 'class-validator';

export class InviteAttendeeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
