import { GroupMessageMention } from '../models/group.models';

/** Nhãn của lựa chọn "báo cho cả nhóm". Dùng chung cho cả lúc chèn vào ô nhập
 *  lẫn lúc tô màu trong tin nhắn đã gửi, nên chỉ được khai báo một chỗ. */
export const MENTION_ALL_LABEL = 'All';

/**
 * Bỏ dấu tiếng Việt + hạ chữ thường để so khớp gần đúng.
 *
 * Nhờ vậy gõ "@Quoc" vẫn tìm ra "Quốc Cường" — người dùng gõ nhanh hiếm khi
 * bật bộ gõ dấu giữa chừng chỉ để tìm tên. `đ/Đ` phải xử lý riêng vì nó là
 * một chữ cái độc lập, không phải "d" + dấu, nên NFD không tách ra được.
 */
export function normalizeForMentionSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();
}

/** Một mention đang được gõ dở trong ô nhập. */
export interface ActiveMentionQuery {
  /** Phần chữ sau dấu `@` — chính là từ khoá lọc. */
  readonly query: string;
  /** Vị trí của dấu `@`. */
  readonly start: number;
  /** Vị trí con trỏ (kết thúc phần đang gõ). */
  readonly end: number;
}

/** Ký tự đứng ngay trước `@` phải là đầu chuỗi hoặc khoảng trắng — nếu không
 *  thì "user@example.com" hay "a@b" sẽ bị hiểu nhầm là đang gõ mention. */
function isMentionBoundary(text: string, atIndex: number): boolean {
  if (atIndex === 0) return true;
  return /\s/.test(text[atIndex - 1]);
}

/**
 * Tìm mention đang gõ dở tại vị trí con trỏ, hoặc null nếu không có.
 *
 * Quét NGƯỢC từ con trỏ về đầu chuỗi để tìm dấu `@` gần nhất. Dừng lại khi
 * gặp ký tự xuống dòng hoặc khi phần đang gõ đã dài quá mức hợp lý — tên
 * người dùng có thể chứa khoảng trắng ("Quốc Cường") nên không thể dừng ở
 * khoảng trắng đầu tiên, nhưng cũng không được cho phép cả câu văn phía sau
 * dấu `@` biến thành từ khoá tìm kiếm.
 */
const MAX_MENTION_QUERY_LENGTH = 40;
const MAX_MENTION_QUERY_WORDS = 4;

export function findActiveMention(
  text: string,
  caret: number,
): ActiveMentionQuery | null {
  if (caret < 0 || caret > text.length) return null;

  for (let i = caret - 1; i >= 0; i--) {
    const char = text[i];
    if (char === '\n') return null;
    if (char !== '@') continue;
    if (!isMentionBoundary(text, i)) return null;

    const query = text.slice(i + 1, caret);
    if (query.length > MAX_MENTION_QUERY_LENGTH) return null;
    if (query.split(/\s+/).length > MAX_MENTION_QUERY_WORDS) return null;
    return { query, start: i, end: caret };
  }

  return null;
}

export interface MentionInsertion {
  readonly text: string;
  readonly caret: number;
}

/**
 * Thay phần `@...` đang gõ dở bằng mention hoàn chỉnh.
 *
 * Chỉ đụng vào đúng đoạn từ dấu `@` tới con trỏ — phần trước và phần sau giữ
 * nguyên tuyệt đối, kể cả khi mention nằm giữa câu.
 *
 * Con trỏ luôn dừng SAU một khoảng trắng, dù khoảng trắng đó là do hàm này
 * thêm vào hay đã có sẵn phía sau. Đặt ngay sát tên thì ký tự người dùng gõ
 * tiếp sẽ dính vào nhãn mention và làm hỏng chính mention vừa chèn.
 */
export function insertMention(
  text: string,
  active: ActiveMentionQuery,
  label: string,
): MentionInsertion {
  const before = text.slice(0, active.start);
  const after = text.slice(active.end);
  const mention = `@${label}`;
  const hasTrailingSpace = after.startsWith(' ');
  const inserted = hasTrailingSpace ? mention : `${mention} `;

  return {
    text: `${before}${inserted}${after}`,
    caret: before.length + inserted.length + (hasTrailingSpace ? 1 : 0),
  };
}

/** Một mảnh nội dung tin nhắn: hoặc chữ thường, hoặc một mention cần tô màu. */
export interface MessageSegment {
  readonly text: string;
  readonly mention: GroupMessageMention | null;
}

/**
 * Cắt nội dung tin nhắn thành các mảnh để giao diện tô màu phần mention.
 *
 * Dùng metadata (`mentions`) làm nguồn sự thật chứ KHÔNG quét regex mù trên
 * nội dung: chỉ những đoạn `@nhãn` khớp đúng nhãn đã lưu mới được tô, nên một
 * câu chứa "@ai đó" ngẫu nhiên không bị hiểu nhầm thành mention. Tin nhắn cũ
 * (chưa có metadata) trả về đúng một mảnh chữ thường — hiển thị y như trước.
 *
 * Nhãn dài được thử trước nhãn ngắn để "@An" không nuốt mất "@An Nhiên".
 */
export function splitMessageSegments(
  text: string,
  mentions: readonly GroupMessageMention[] | undefined,
): MessageSegment[] {
  if (!text) return [];
  if (!mentions?.length) return [{ text, mention: null }];

  const candidates = [...mentions]
    .filter((m) => !!m.label)
    .sort((a, b) => b.label.length - a.label.length);

  const segments: MessageSegment[] = [];
  let plainStart = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '@' || !isMentionBoundary(text, i)) {
      i++;
      continue;
    }

    const hit = candidates.find(
      (m) => text.slice(i + 1, i + 1 + m.label.length) === m.label,
    );
    if (!hit) {
      i++;
      continue;
    }

    if (i > plainStart) {
      segments.push({ text: text.slice(plainStart, i), mention: null });
    }
    const end = i + 1 + hit.label.length;
    segments.push({ text: text.slice(i, end), mention: hit });
    i = end;
    plainStart = end;
  }

  if (plainStart < text.length) {
    segments.push({ text: text.slice(plainStart), mention: null });
  }

  return segments;
}

/** Tin nhắn này có nhắc tới `userId` không (kể cả qua @All). */
export function mentionsUser(
  mentions: readonly GroupMessageMention[] | undefined,
  userId: string,
): boolean {
  if (!mentions?.length) return false;
  return mentions.some(
    (m) => m.type === 'all' || (m.type === 'user' && m.userId === userId),
  );
}

/**
 * Lọc giá trị `mentions` đọc thẳng từ hàng CSDL (kênh Supabase Realtime bỏ
 * qua backend nên không được chuẩn hoá sẵn). Tin nhắn cũ có giá trị null.
 */
export function normalizeMentions(
  value: unknown,
): GroupMessageMention[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const list = value
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .filter((m) => m['type'] === 'user' || m['type'] === 'all')
    .map((m) => ({
      type: m['type'] as 'user' | 'all',
      userId: typeof m['userId'] === 'string' ? m['userId'] : undefined,
      label: typeof m['label'] === 'string' ? m['label'] : '',
    }))
    .filter((m) => !!m.label && (m.type === 'all' || !!m.userId));

  return list.length > 0 ? list : undefined;
}

/** Đảm bảo URL có tiền tố http:// hoặc https:// để trình duyệt mở trang ngoại thay vì mở route tương đối. */
export function formatExternalUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export interface TextToken {
  readonly text: string;
  readonly isUrl: boolean;
  readonly href: string;
}

const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9-]+\.(?:jit\.si|google\.com|zoom\.us|teams\.microsoft\.com|me|com|net|org|io|dev|app)\/[^\s<]*)/gi;

/** Cắt chuỗi văn bản thông thường để tìm các liên kết/URL và đánh dấu để giao diện chèn thẻ <a>. */
export function parseTextUrls(text: string): TextToken[] {
  if (!text) return [];
  const tokens: TextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, matchIndex), isUrl: false, href: '' });
    }

    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[.,!?;:]+$/, '');
    const trailingPunctuation = rawUrl.slice(cleanUrl.length);
    const href = formatExternalUrl(cleanUrl);

    tokens.push({ text: cleanUrl, isUrl: true, href });

    if (trailingPunctuation) {
      tokens.push({ text: trailingPunctuation, isUrl: false, href: '' });
    }

    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), isUrl: false, href: '' });
  }

  return tokens;
}
