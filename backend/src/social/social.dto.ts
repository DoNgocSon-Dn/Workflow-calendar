import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class FriendRequestDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class FriendCodeRequestDto {
  @IsString() @MaxLength(32)
  @Matches(/^(?:WF-?)?[A-F0-9]{4}-?[A-F0-9]{4}-?[A-F0-9]{4}$/i)
  code!: string;
}
export class FriendActionDto {
  @IsIn(['accept', 'decline', 'cancel', 'remove']) action!:
    'accept' | 'decline' | 'cancel' | 'remove';
}
export class BlockUserDto {
  @IsBoolean() blocked!: boolean;
}
export class SendDirectMessageDto {
  @IsUUID() clientId!: string;
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}
export class MessageCursorDto {
  @IsOptional() @IsUUID() before?: string;
}
export class ReadMessagesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  messageIds!: string[];
}
