/**
 * Strip HTML tags and decode HTML entities from text (e.g., imported Google Calendar descriptions).
 * Converts <br>, </p>, </div> into line breaks and extracts pure plain text.
 */
export function stripHtmlTags(input: string | null | undefined): string {
  if (!input) return '';

  let text = input;

  // Replace common HTML block/line break elements with newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  // Use DOMParser when available in browser to strip remaining tags and decode entities
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body.textContent || '';
    } catch {
      text = text.replace(/<[^>]+>/g, '');
    }
  } else {
    // Regex fallback
    text = text.replace(/<[^>]+>/g, '');
  }

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Normalize excessive empty lines and spaces
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** URL phòng họp trực tuyến phổ biến (Google Meet, Zoom, Teams, Jitsi…). */
const CONFERENCE_URL_RE =
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:meet\.google\.com|zoom\.us|teams\.(?:microsoft|live)\.com|meet\.jit\.si|whereby\.com|webex\.com)\/[^\s<>"')\]]+/i;

/** Lấy link phòng họp đầu tiên tìm thấy trong một đoạn text (nếu có). */
export function extractConferenceLink(input: string | null | undefined): string | null {
  if (!input) return null;
  return input.match(CONFERENCE_URL_RE)?.[0] ?? null;
}

/** Chuỗi CHỈ gồm đúng một link phòng họp (bỏ khoảng trắng thừa). */
export function isConferenceLinkOnly(input: string | null | undefined): boolean {
  const t = (input ?? '').trim();
  return !!t && CONFERENCE_URL_RE.test(t) && t.replace(CONFERENCE_URL_RE, '').trim() === '';
}

/**
 * Dọn phần "rác" Google Calendar chèn vào mô tả sự kiện Meet:
 *  - khối nằm giữa hai dòng phân cách `-::~ … ~::-`
 *  - các dòng "Join with Google Meet: …", "Learn more about Meet at: …",
 *    "Or dial: …", "PIN: …", "Please do not edit this section."
 * Giữ nguyên phần mô tả thật do người dùng viết.
 */
export function cleanImportedDescription(input: string | null | undefined): string {
  let text = stripHtmlTags(input);
  if (!text) return '';

  text = text.replace(/-::~[~:]*::-[\s\S]*?-::~[~:]*::-/g, '');
  text = text.replace(/-::~[~:]*::-[\s\S]*$/g, '');

  text = text
    .split('\n')
    .filter(
      (line) =>
        !/^\s*(join with google meet|or dial|learn more about meet at|please do not edit this section|pin:)/i.test(
          line,
        ),
    )
    .join('\n');

  return text.replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}
