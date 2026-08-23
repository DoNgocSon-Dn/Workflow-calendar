import { IsBoolean } from 'class-validator';

export class SetGroupHiddenDto {
  @IsBoolean()
  hidden: boolean;
}
