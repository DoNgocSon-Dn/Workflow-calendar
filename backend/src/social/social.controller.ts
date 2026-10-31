import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  BlockUserDto,
  FriendActionDto,
  FriendRequestDto,
  MessageCursorDto,
  ReadMessagesDto,
  SendDirectMessageDto,
} from './social.dto';
import { SocialService } from './social.service';

@Controller('social')
@UseGuards(SupabaseAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}
  @Get() overview(@CurrentSupabase() client: SupabaseClient) {
    return this.social.overview(client);
  }
  @Post('requests')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  request(
    @CurrentSupabase() client: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: FriendRequestDto,
  ) {
    return this.social.request(client, user.id, dto.email);
  }
  @Patch('requests/:id')
  action(
    @CurrentSupabase() client: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FriendActionDto,
  ) {
    return this.social.action(client, user.id, id, dto.action);
  }
  @Put('blocks/:peer')
  block(
    @CurrentSupabase() client: SupabaseClient,
    @CurrentUser() user: User,
    @Param('peer', ParseUUIDPipe) peer: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.social.block(client, user.id, peer, dto.blocked);
  }
  @Post('messages/read')
  read(
    @CurrentSupabase() client: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: ReadMessagesDto,
  ) {
    return this.social.read(client, user.id, dto.messageIds);
  }
  @Get('messages/:peer')
  messages(
    @CurrentSupabase() client: SupabaseClient,
    @Param('peer', ParseUUIDPipe) peer: string,
    @Query() dto: MessageCursorDto,
  ) {
    return this.social.messages(client, peer, dto.before);
  }
  @Post('messages/:peer')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  send(
    @CurrentSupabase() client: SupabaseClient,
    @CurrentUser() user: User,
    @Param('peer', ParseUUIDPipe) peer: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.social.send(client, user.id, peer, dto.clientId, dto.body);
  }
}
