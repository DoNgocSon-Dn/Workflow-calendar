import { Body, Controller, Delete, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { IsString, MaxLength } from 'class-validator';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SaveSubscriptionDto } from './dto/save-subscription.dto';
import { PushService } from './push.service';

class UnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

@Controller('push')
@UseGuards(SupabaseAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: SaveSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    await this.pushService.saveSubscription(supabase, user.id, dto, userAgent);
  }

  @Delete('subscribe')
  @HttpCode(204)
  async unsubscribe(
    @CurrentSupabase() supabase: SupabaseClient,
    @Body() dto: UnsubscribeDto,
  ): Promise<void> {
    await this.pushService.deleteSubscription(supabase, dto.endpoint);
  }
}
