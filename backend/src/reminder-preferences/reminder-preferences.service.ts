import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

/** Bộ mốc nhắc mặc định khi khách ĐỒNG Ý lời mời — phút TRƯỚC giờ bắt đầu
 *  (0 = đúng giờ diễn ra). */
export const DEFAULT_REMINDER_OFFSETS = [30, 15, 5, 0];

interface PrefRow {
  offsets: number[];
}

@Injectable()
export class ReminderPreferencesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /** Đọc bộ mốc của một người — service-role, dùng được cả khi gọi thay người
   *  khác (luồng accept). Chưa đặt bao giờ ⇒ trả bộ mặc định. */
  async getOffsets(userId: string): Promise<number[]> {
    const admin = this.supabaseService.getServiceRoleClient();
    const { data, error } = await admin
      .from('reminder_preferences')
      .select('offsets')
      .eq('user_id', userId)
      .maybeSingle<PrefRow>();
    // 42P01 = bảng chưa tồn tại (migration 38 chưa chạy) ⇒ dùng bộ mặc định
    // thay vì làm hỏng luồng accept.
    if (error && error.code !== '42P01') {
      throw new InternalServerErrorException(error.message);
    }
    return data?.offsets ?? [...DEFAULT_REMINDER_OFFSETS];
  }

  /** Ghi bộ mốc của chính người gọi (đi qua RLS client của họ). Chuẩn hoá:
   *  bỏ trùng, sắp giảm dần, tối đa 12 mốc. */
  async setOffsets(
    supabase: SupabaseClient,
    userId: string,
    offsets: number[],
  ): Promise<{ offsets: number[] }> {
    const clean = [...new Set(offsets.map((n) => Math.round(n)).filter((n) => n >= 0))]
      .sort((a, b) => b - a)
      .slice(0, 12);

    const { error } = await supabase
      .from('reminder_preferences')
      .upsert(
        { user_id: userId, offsets: clean, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return { offsets: clean };
  }
}
