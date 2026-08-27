import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsIn(NOTE_COLORS)
  color!: NoteColor;
}
