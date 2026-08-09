import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config/configuration';

@Injectable()
export class SupabaseService {
  private anonClient: SupabaseClient | null = null;
  private serviceRoleClient: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  /**
   * Client with no user context — only used to verify bearer tokens via
   * `auth.getUser(token)`. Never used to read/write app tables directly.
   */
  getAnonClient(): SupabaseClient {
    if (!this.anonClient) {
      const { url, anonKey } = this.configService.get('supabase', {
        infer: true,
      });
      this.anonClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.anonClient;
  }

  /**
   * Per-request client scoped to the caller's JWT, so every query runs
   * through Postgres RLS as that specific user. This is the only client the
   * rest of the app should use to touch `calendars`/`events`/etc.
   */
  getClientForToken(token: string): SupabaseClient {
    const { url, anonKey } = this.configService.get('supabase', {
      infer: true,
    });
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }) as SupabaseClient;
  }

  /**
   * Bypasses RLS entirely — only for code with no user JWT to scope by
   * (cron jobs, the respond-via-email public endpoint). Never expose this
   * client's queries directly to a user-supplied id without checking
   * ownership/token validity in the calling code first.
   */
  getServiceRoleClient(): SupabaseClient {
    if (!this.serviceRoleClient) {
      const { url, serviceRoleKey } = this.configService.get('supabase', {
        infer: true,
      });
      this.serviceRoleClient = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.serviceRoleClient;
  }
}
