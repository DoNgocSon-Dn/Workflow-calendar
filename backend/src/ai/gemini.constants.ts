/**
 * Model gọi qua Generative Language API (v1beta `generateContent`).
 * `gemini-flash-latest` là alias luôn trỏ tới bản Flash mới nhất; `gemini-2.0-flash`
 * là bản ghim ổn định làm dự phòng nếu alias đổi hành vi hoặc trả 404.
 * (Đừng ghi ở đây id không có thật như "gemini-3.6-flash" — fallback sẽ chết.)
 */
export const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.0-flash'] as const;

/**
 * Google AI Studio phát key ở HAI định dạng, cả hai đều hợp lệ:
 *   - cũ:  "AIzaSy..."  (~39 ký tự)
 *   - mới: "AQ.Ab8..."  (định dạng mới, ~50+ ký tự)
 * Hàm này chỉ bắt các trường hợp CHẮC CHẮN sai: rỗng hoặc giá trị giữ chỗ
 * (your-key, change-me, ...) — để cảnh báo sớm thay vì tưởng "AI tự nhiên hỏng".
 */
export function looksLikeGeminiApiKey(key: string): boolean {
  const k = key.trim();
  if (k.length < 20) return false;
  if (/^(your|my|change|todo|xxx|placeholder|api[-_]?key)/i.test(k)) return false;
  return /^AIza[0-9A-Za-z_-]{10,}$/.test(k) || /^AQ\.[0-9A-Za-z_-]{10,}$/.test(k);
}
