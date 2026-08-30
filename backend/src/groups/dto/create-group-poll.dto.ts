import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateGroupPollDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

export class VoteGroupPollDto {
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  optionIds: string[];
}
