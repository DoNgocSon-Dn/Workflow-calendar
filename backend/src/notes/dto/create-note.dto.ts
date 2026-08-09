import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsIn(NOTE_COLORS)
  color!: NoteColor;
}
