import { HttpErrorResponse } from '@angular/common/http';

export const SUPABASE_TIMEOUT_MSG =
  'Lỗi do cơ sở dữ liệu Supabase bị quá thời gian chờ (Supabase Database Timeout). Vui lòng thử lại sau giây lát.';

/**
 * Kiểm tra xem một chuỗi thông báo lỗi có phải do Supabase Timeout / Cloudflare 522/524/504 hay không.
 */
export function isSupabaseTimeoutError(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('522') ||
    lower.includes('524') ||
    lower.includes('504') ||
    lower.includes('520') ||
    lower.includes('521') ||
    lower.includes('connection timed out') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('cloudflare') ||
    lower.includes('<!doctype') ||
    lower.includes('<html') ||
    lower.includes('supabase database timeout') ||
    lower.includes('cơ sở dữ liệu supabase')
  );
}

/**
 * Bóc tách thông báo lỗi thân thiện từ HttpErrorResponse hoặc Exception bất kỳ.
 * Luôn phát hiện và chuẩn hoá các lỗi Supabase Timeout thành thông báo rõ ràng cho người dùng.
 */
export function extractHttpErrorMessage(
  err: unknown,
  fallback: string,
  networkFallback = fallback,
): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return networkFallback;
    if (err.status === 504) return SUPABASE_TIMEOUT_MSG;

    const inner = err.error as { message?: string | string[] } | undefined;
    const msg = inner?.message;
    const raw = Array.isArray(msg)
      ? msg.join(', ')
      : typeof msg === 'string'
        ? msg
        : typeof err.error === 'string'
          ? err.error
          : '';

    if (raw) {
      if (isSupabaseTimeoutError(raw)) {
        return SUPABASE_TIMEOUT_MSG;
      }
      return raw;
    }
  } else if (err instanceof Error && isSupabaseTimeoutError(err.message)) {
    return SUPABASE_TIMEOUT_MSG;
  }
  return fallback;
}
