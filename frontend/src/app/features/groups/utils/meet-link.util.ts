/**
 * Chuẩn hoá link phòng họp Google Meet mà người dùng dán vào.
 *
 * App không có OAuth scope Google Calendar (đăng nhập chỉ verify ID token),
 * nên backend KHÔNG thể tự sinh link Meet qua API. Luồng thật là: mở
 * `meet.google.com/new` cho Google tạo phòng, rồi người dùng dán link/mã đó
 * về đây. Vì link đi qua tay người nên phải kiểm lại: dán nhầm link Zoom,
 * Jitsi hay một URL bất kỳ thì cả nhóm bấm vào mới phát hiện.
 */

/** Tên miền duy nhất được chấp nhận. */
const MEET_HOST = 'meet.google.com';

/** Mã phòng chuẩn của Google Meet: ba cụm chữ thường 3-4-3. */
const MEET_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/** Link đặt tên sẵn (`meet.google.com/lookup/<tên>`) — không theo dạng 3-4-3
 *  và có phân biệt hoa thường, nên được xử lý riêng. */
const MEET_LOOKUP_PATTERN = /^lookup\/[A-Za-z0-9_-]{1,64}$/;

/**
 * Trả về link Meet dạng đầy đủ `https://meet.google.com/<mã>`, hoặc `null`
 * nếu chuỗi vào không phải một phòng Meet hợp lệ.
 *
 * Chấp nhận cả bốn dạng người dùng hay dán: URL đầy đủ, URL không scheme,
 * URL kèm query (`?authuser=0`), và mã trần `abc-defg-hij`.
 */
export function normalizeMeetLink(input: string): string | null {
  const path = extractMeetPath(input.trim());
  if (path === null) return null;
  if (!MEET_CODE_PATTERN.test(path) && !MEET_LOOKUP_PATTERN.test(path)) return null;
  return `https://${MEET_HOST}/${path}`;
}

/** Rút phần đường dẫn phòng họp, sau khi đã bỏ scheme, query và dấu `/` thừa. */
function extractMeetPath(raw: string): string | null {
  if (!raw) return null;

  // Mã trần "abc-defg-hij" — không có dấu / nên không phải URL.
  if (!raw.includes('/')) return raw.toLowerCase();

  let url: URL;
  try {
    // Thêm scheme cho dạng "meet.google.com/abc-defg-hij": thiếu scheme thì
    // URL() coi cả chuỗi là đường dẫn tương đối và ném lỗi.
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== MEET_HOST) return null;

  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  // Tên trong link `lookup/` phân biệt hoa thường — giữ nguyên, chỉ hạ chữ
  // thường với mã phòng 3-4-3 (Google luôn cấp chữ thường).
  return path.startsWith('lookup/') ? path : path.toLowerCase();
}
