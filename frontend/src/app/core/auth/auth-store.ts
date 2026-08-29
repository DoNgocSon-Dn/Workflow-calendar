import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase-client';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly supabase = inject(SUPABASE_CLIENT);

  readonly session = signal<Session | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.access_token ?? null);
  readonly displayName = computed(() => {
    const metadata = this.user()?.user_metadata as Record<string, unknown> | undefined;
    const fullName = metadata?.['full_name'];
    return typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null;
  });
  readonly avatarUrl = computed(() => {
    const metadata = this.user()?.user_metadata as Record<string, unknown> | undefined;
    const avatarUrl = metadata?.['avatar_url'];
    return typeof avatarUrl === 'string' && avatarUrl ? avatarUrl : null;
  });

  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    // KHÔNG được để bước này làm treo cả lần dựng ứng dụng: `getSession()` có
    // thể gọi mạng (refresh token) và mạng có thể chậm/lỗi — nhất là trong
    // trình duyệt in-app của Zalo/Messenger. Nếu hỏng, khởi động ở trạng thái
    // "chưa đăng nhập"; onAuthStateChange bên dưới vẫn bắt được phiên khi
    // Supabase khôi phục xong ở nền.
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 8000),
      );
      const { data } = await Promise.race([this.supabase.auth.getSession(), timeout]);
      this.session.set(data.session);
    } catch (err) {
      console.warn('[auth] getSession lỗi/quá lâu — khởi động không phiên:', err);
      this.session.set(null);
    }

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  /**
   * Cách đăng nhập duy nhất của ứng dụng. Không còn luồng email/mật khẩu nên
   * cũng không còn đăng ký hay đặt lại mật khẩu — tài khoản mới được Supabase
   * tạo ngay trong lần đăng nhập Google đầu tiên.
   *
   * `returnUrl` cho phép quay lại đúng trang đã kéo người dùng vào /login
   * (vd. authGuard giữ lại `?returnUrl=` khi chặn một route cần đăng nhập) —
   * mặc định vẫn là /calendar như trước. Đây là redirect toàn trang qua
   * Supabase/Google chứ không phải Angular router, nên phải truyền thẳng vào
   * đây thay vì trông chờ router điều hướng lại sau khi quay về.
   */
  async signInWithGoogle(returnUrl?: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${returnUrl || '/calendar'}`,
      },
    });
    return error;
  }

  /**
   * Giới hạn tên hiển thị.
   *
   * Tên này hiện ở nhiều chỗ chật: menu người dùng trên header, danh sách thành
   * viên nhóm, tên người gửi trong khung chat. Không chặn thì một chuỗi dài
   * không dấu cách sẽ kéo phình cả khối chứa nó.
   *
   * Cắt Ở ĐÂY chứ không chỉ dựa vào maxlength của ô nhập: maxlength chỉ chặn
   * lúc GÕ, người dùng vẫn dán được chuỗi dài hoặc gọi thẳng hàm này từ chỗ
   * khác. Đây là chốt duy nhất mọi đường lưu tên đều đi qua.
   */
  static readonly DISPLAY_NAME_MAX = 16;

  async updateDisplayName(fullName: string): Promise<AuthError | null> {
    const trimmed = fullName.trim().slice(0, AuthStore.DISPLAY_NAME_MAX);
    const { error } = await this.supabase.auth.updateUser({ data: { full_name: trimmed } });
    return error;
  }

  async uploadAvatar(file: File): Promise<string | AuthError> {
    const userId = this.user()?.id;
    if (!userId) {
      return { name: 'AuthError', message: 'Chưa đăng nhập' } as AuthError;
    }

    const extension = file.name.split('.').pop() ?? 'png';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      return { name: 'StorageError', message: uploadError.message } as AuthError;
    }

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await this.supabase.auth.updateUser({
      data: { avatar_url: data.publicUrl },
    });
    if (updateError) return updateError;

    return data.publicUrl;
  }

  /** Một lần làm mới đang chạy dở, để nhiều request 401 cùng lúc dùng chung. */
  private refreshInFlight: Promise<boolean> | null = null;

  /**
   * Xin phiên mới bằng refresh token.
   *
   * Trả về `true` nếu đã có access token mới dùng được.
   *
   * Gộp mọi lời gọi song song vào MỘT lần làm mới là bắt buộc, không phải tối
   * ưu: Supabase xoay vòng refresh token, nên hai lần làm mới chạy song song
   * sẽ khiến lần sau vô hiệu hoá token của lần trước và đăng xuất người dùng
   * ngay giữa chừng.
   */
  refreshSession(): Promise<boolean> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession();
      if (error || !data.session) return false;
      this.session.set(data.session);
      return true;
    } catch {
      // Mất mạng hoặc refresh token đã bị thu hồi — coi như không làm mới được.
      return false;
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}
