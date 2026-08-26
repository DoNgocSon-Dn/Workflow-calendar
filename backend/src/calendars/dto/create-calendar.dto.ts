import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const CALENDAR_COLORS = [
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'teal',
] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export class CreateCalendarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIn(CALENDAR_COLORS)
  color!: CalendarColor;
}
