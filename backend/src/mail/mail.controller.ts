import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { TestSendMailDto } from './dto/test-send-mail.dto';
import { MailService } from './mail.service';

// Guard bắt buộc — không thì ai cũng gọi được để spam qua Gmail của bạn.
@Controller('mail')
@UseGuards(SupabaseAuthGuard)
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test-send')
  async testSend(@CurrentUser() user: User, @Body() dto: TestSendMailDto) {
    await this.mailService.sendMail({
      to: dto.to ?? user.email ?? '',
      subject: 'Test email từ Calendar App',
      html: '<p>Đây là email test.</p>',
    });
    return { ok: true };
  }
}
