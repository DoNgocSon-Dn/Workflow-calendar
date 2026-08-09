import { IsIn, IsNotEmpty, IsString } from 'class-validator';

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
  name!: string;

  @IsIn(CALENDAR_COLORS)
  color!: CalendarColor;
}
