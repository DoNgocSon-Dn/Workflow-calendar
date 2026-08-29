import { IsIn } from 'class-validator';

const ALLOWED = ['❤️', '😆', '👍', '😮', '😢', '🙏'] as const;

export class ToggleReactionDto {
  @IsIn(ALLOWED as unknown as string[])
  emoji!: string;
}
