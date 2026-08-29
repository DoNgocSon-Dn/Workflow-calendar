import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { AppConfig } from '../config/configuration';
import { SupabaseService } from '../supabase/supabase.service';
import { SaveSubscriptionDto } from './dto/save-subscription.dto';

interface PushSubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  /** Nội dung tĩnh, HOẶC 'reminder' để service worker tự dựng câu từ `startAt`. */
  body: string;
  /** ISO khởi đầu sự kiện — service worker format theo múi giờ + ngôn ngữ máy. */
  startAt?: string;
  /** Đường dẫn mở khi bấm vào thông báo (mặc định '/calendar'). */
  url?: string;
  tag?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly supabaseService: SupabaseService,
  ) {
    const { vapidPublicKey, vapidPrivateKey, vapidSubject } = this.configService.get('push', {
      infer: true,
    });
    this.enabled = Boolean(vapidPublicKey && vapidPrivateKey);
    if (this.enabled) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY chưa cấu hình — Web Push tắt. ' +
          'Sinh khoá: npx web-push generate-vapid-keys',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Lưu (hoặc cập nhật) một đăng ký. Khoá theo `endpoint` để đổi thiết bị /
   *  gia hạn không sinh hàng rác. */
  async saveSubscription(
    supabase: SupabaseClient,
    userId: string,
    dto: SaveSubscriptionDto,
    userAgent?: string,
  ): Promise<void> {
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        user_agent: userAgent ?? null,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new Error(error.message);
  }

  async deleteSubscription(supabase: SupabaseClient, endpoint: string): Promise<void> {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);
    if (error) throw new Error(error.message);
  }

  /**
   * Đẩy thông báo tới MỌI thiết bị của một người dùng. Gọi từ cron (không có
   * JWT) nên dùng service-role client. Subscription chết (404/410) bị xoá luôn.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
      .returns<PushSubRow[]>();

    if (error) {
      this.logger.error(`Không đọc được push_subscriptions của ${userId}: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      startAt: payload.startAt,
      url: payload.url ?? '/calendar',
      tag: payload.tag,
    });

    const staleIds: string[] = [];
    await Promise.all(
      data.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            staleIds.push(sub.id);
          } else {
            this.logger.warn(`Gửi push thất bại (${status ?? '?'}) cho sub ${sub.id}`);
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }
  }
}
