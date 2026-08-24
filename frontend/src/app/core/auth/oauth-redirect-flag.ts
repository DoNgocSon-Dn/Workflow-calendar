/**
 * Google trả người dùng về thẳng `/calendar` (xem redirectTo trong
 * AuthStore.signInWithGoogle), không qua route callback riêng. Supabase sẽ
 * đọc token trong URL rồi xoá sạch query/hash ngay khi client khởi tạo, nên
 * phải chụp lại dấu vết đó TRƯỚC lúc bootstrap Angular — muộn hơn là mất.
 */

/** Implicit flow để token ở hash, PKCE để `code` ở query. */
const OAUTH_MARKER = /(^|[#&?])(access_token=|code=)/;

let arrivedFromOauth = false;

/** Gọi một lần duy nhất ở main.ts, trước bootstrapApplication(). */
export function captureOauthRedirect(): void {
  const { hash, search } = window.location;
  arrivedFromOauth = OAUTH_MARKER.test(hash) || OAUTH_MARKER.test(search);
}

/**
 * Đọc và xoá cờ. Xoá luôn để hiệu ứng chỉ chạy đúng một lần: người dùng bấm
 * F5 hay điều hướng nội bộ sau đó thì vào thẳng lịch.
 */
export function consumeOauthRedirect(): boolean {
  const value = arrivedFromOauth;
  arrivedFromOauth = false;
  return value;
}
