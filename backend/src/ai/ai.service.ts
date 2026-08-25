import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/** Một việc do AI đề xuất. CHƯA được lưu — người dùng phải chọn trước. */
export interface AiSuggestedTodo {
  content: string;
  description?: string;
  /** Chỉ có khi người dùng đã cho đủ dữ kiện thời gian. Thiếu thì để trống,
   *  KHÔNG suy đoán hộ. */
  due_at?: string;
}

export interface AiParsedIntent {
  intent: 'create_event' | 'create_todos' | 'chat' | 'unclear';
  title?: string;
  start_at?: string;
  end_at?: string;
  location?: string;
  description?: string;
  allDay?: boolean;
  attendees?: string[];
  recurrence_rule?: string | null;
  /** Câu trả lời tự nhiên khi intent là 'chat' (hỏi về lịch hoặc trò chuyện chung). */
  reply?: string;
  /** Danh sách việc đề xuất khi intent là 'create_todos'. */
  todos?: AiSuggestedTodo[];
  /** Mục tiêu tóm tắt, dùng làm tiêu đề cho bảng xem trước. */
  goal?: string;
}

/**
 * Một sự kiện AI đọc được từ file.
 *
 * `start`/`end` CỐ Ý là tuỳ chọn: file chỉ ghi "Họp với khách hàng" mà không
 * có ngày giờ thì phải để trống và nói rõ ra, tuyệt đối không đắp một mốc thời
 * gian bịa vào cho đủ trường.
 */
export interface AiFileEvent {
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  /** Nêu rõ thiếu gì khi không đủ dữ kiện, hiển thị nguyên văn cho người dùng. */
  missing?: string;
}

export interface AiFileAnalysis {
  /** Loại nội dung AI nhận ra trong file. */
  kind: 'events' | 'todos' | 'mixed' | 'none';
  /** Một câu tóm tắt AI tìm thấy gì, hiện trong khung chat. */
  summary: string;
  events: AiFileEvent[];
  todos: AiSuggestedTodo[];
}

export interface AiChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiEventSummary {
  title: string;
  start: string;
  end: string;
  location?: string;
  allDay?: boolean;
}

export interface AiChatContext {
  history: AiChatHistoryEntry[];
  events: AiEventSummary[];
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async chat(userText: string, context: AiChatContext): Promise<AiParsedIntent> {
    const { geminiApiKey } = this.configService.get('ai', { infer: true });

    // 1. Thử gọi Gemini AI nếu có key — hiểu ngôn ngữ tự nhiên thật sự và có
    // thể trò chuyện/trả lời về lịch, không chỉ tạo sự kiện.
    if (geminiApiKey && geminiApiKey.trim().length > 0) {
      try {
        const geminiResult = await this.callGemini(userText, geminiApiKey.trim(), context);
        if (geminiResult) {
          if (geminiResult.intent === 'create_event' && geminiResult.start_at) return geminiResult;
          if (geminiResult.intent === 'chat' && geminiResult.reply) return geminiResult;
          if (geminiResult.intent === 'create_todos' && geminiResult.todos?.length) return geminiResult;
          if (geminiResult.intent === 'unclear') return geminiResult;
        }
      } catch (err: any) {
        this.logger.warn(`Gemini AI parsing failed, falling back to local NLP: ${err.message}`);
      }
    }

    // 2. Fallback sang bộ phân tích ngôn ngữ tự nhiên tiếng Việt thông minh —
    // chỉ nhận diện được ý định tạo sự kiện, không trò chuyện tự do được
    // (cần Gemini để hiểu ngôn ngữ tự nhiên thật sự).
    return this.parseLocalVietnameseEvent(userText);
  }

  /**
   * Đọc nội dung một file đã được trích xuất thành văn bản và đề xuất sự kiện
   * / việc cần làm.
   *
   * KHÔNG lưu gì cả — kết quả chỉ để dựng bảng xem trước cho người dùng duyệt.
   * Khác với chat(), ở đây KHÔNG có nhánh dự phòng cục bộ: bộ phân tích cục bộ
   * chỉ biết đoán bừa ngày giờ, mà với file thì đoán bừa còn tệ hơn là báo
   * không đọc được.
   */
  async analyzeFile(
    fileText: string,
    fileName: string,
    instruction: string,
  ): Promise<AiFileAnalysis> {
    const { geminiApiKey } = this.configService.get('ai', { infer: true });
    const apiKey = geminiApiKey?.trim();
    if (!apiKey) {
      throw new Error('Chưa cấu hình GEMINI_API_KEY nên không phân tích được file.');
    }

    // Cắt bớt để prompt không phình vô hạn với file dài. Giữ phần đầu vì lịch
    // học/lịch họp gần như luôn nằm ngay đầu tài liệu.
    const MAX_CHARS = 12000;
    const truncated = fileText.length > MAX_CHARS;
    const body = fileText.slice(0, MAX_CHARS);

    const now = new Date();
    const vnTimeStr = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(now);

    const prompt = `Bạn là trợ lý phân tích tài liệu để dựng lịch và danh sách việc cần làm.
Thời điểm hiện tại: ${vnTimeStr} (ISO: ${now.toISOString()}). Múi giờ: Asia/Ho_Chi_Minh (+07:00).

Tên file: "${fileName}"
Yêu cầu của người dùng: ${instruction.trim() ? `"${instruction.trim()}"` : '(người dùng không nói gì thêm — tự quyết định dựa trên nội dung file)'}

Nội dung file${truncated ? ' (đã cắt bớt phần cuối)' : ''}:
"""
${body}
"""

Hãy trả về DUY NHẤT một JSON object (không markdown, không chữ nào khác):
{
  "kind": "events" | "todos" | "mixed" | "none",
  "summary": "một câu tiếng Việt nói bạn tìm thấy gì trong file",
  "events": [
    {
      "title": "tên sự kiện lấy từ file",
      "start": "ISO 8601 +07:00 — BỎ TRỐNG nếu file không cho biết ngày giờ",
      "end": "ISO 8601 +07:00 — bỏ trống nếu không rõ",
      "allDay": false,
      "location": "địa điểm nếu file có ghi",
      "description": "mô tả nếu file có ghi",
      "missing": "nếu thiếu ngày/giờ thì ghi rõ thiếu gì, ví dụ: Không đủ dữ liệu để xác định ngày và giờ."
    }
  ],
  "todos": [
    { "content": "tên việc", "description": "mô tả nếu có", "due_at": "ISO 8601 +07:00 — bỏ trống nếu file không nêu hạn" }
  ]
}

QUY TẮC BẮT BUỘC:
- CHỈ dùng thông tin CÓ THẬT trong file. Tuyệt đối không thêm sự kiện, việc, ngày, giờ, địa điểm mà file không hề nhắc tới.
- Không suy đoán ngày giờ. File chỉ ghi "Họp với khách hàng" mà không có ngày thì để trống "start"/"end" và điền "missing": "Không đủ dữ liệu để xác định ngày và giờ." — đó là câu trả lời ĐÚNG, không phải thiếu sót.
- File chỉ ghi ngày mà không ghi giờ thì đặt "allDay": true, không tự chọn một giờ nào.
- Thứ có mốc thời gian cụ thể (lịch học, lịch họp, buổi hẹn) thì xếp vào "events".
- Thứ là công việc phải làm (deadline, đầu việc, nhiệm vụ) thì xếp vào "todos".
- Người dùng nói rõ muốn gì (vd "tạo danh sách việc cần làm", "thêm vào lịch") thì CHỈ trả về đúng loại đó và để mảng còn lại RỖNG — kể cả khi file có cả hai loại. Người dùng không nói gì thì mới tự phân loại theo nội dung.
- File không có gì liên quan lịch hay công việc thì trả "kind": "none", hai mảng rỗng, và giải thích trong "summary".
- Giữ nguyên tên gọi trong file, không diễn đạt lại thành thứ khác.`;

    const models = ['gemini-flash-latest', 'gemini-3.6-flash'];
    let lastStatus = 0;

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );

        if (!response.ok) {
          lastStatus = response.status;
          this.logger.warn(`Gemini trả lỗi ${response.status} khi phân tích file cho model ${model}.`);
          continue;
        }

        const data = (await response.json()) as GeminiResponse;
        const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJson) continue;

        const parsed = JSON.parse(rawJson) as Partial<AiFileAnalysis>;
        return this.sanitizeFileAnalysis(parsed);
      } catch (err) {
        this.logger.warn(`Phân tích file thất bại với model ${model}: ${(err as Error).message}`);
      }
    }

    throw new Error(
      lastStatus === 429
        ? 'Đã dùng hết lượt gọi AI, vui lòng thử lại sau.'
        : 'Không phân tích được nội dung file, vui lòng thử lại.',
    );
  }

  /**
   * Lọc lại kết quả của model trước khi trả ra.
   *
   * Model đôi khi điền chuỗi rỗng hoặc mốc thời gian không hợp lệ cho trường
   * nó "nên bỏ trống". Ép về undefined ở đây để tầng UI chỉ cần kiểm tra một
   * điều kiện duy nhất là "có start hay không".
   */
  private sanitizeFileAnalysis(parsed: Partial<AiFileAnalysis>): AiFileAnalysis {
    const validIso = (value?: string): string | undefined => {
      if (!value || typeof value !== 'string' || !value.trim()) return undefined;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? undefined : value;
    };

    const events: AiFileEvent[] = (Array.isArray(parsed.events) ? parsed.events : [])
      .filter((e): e is AiFileEvent => !!e && typeof e.title === 'string' && e.title.trim().length > 0)
      .map((e) => {
        const start = validIso(e.start);
        const end = validIso(e.end);
        return {
          title: e.title.trim(),
          ...(start ? { start } : {}),
          // Không có start thì end vô nghĩa, bỏ luôn cho khỏi lệch.
          ...(start && end ? { end } : {}),
          ...(typeof e.allDay === 'boolean' ? { allDay: e.allDay } : {}),
          ...(e.location?.trim() ? { location: e.location.trim() } : {}),
          ...(e.description?.trim() ? { description: e.description.trim() } : {}),
          ...(start
            ? {}
            : { missing: e.missing?.trim() || 'Không đủ dữ liệu để xác định ngày và giờ.' }),
        };
      });

    const todos: AiSuggestedTodo[] = (Array.isArray(parsed.todos) ? parsed.todos : [])
      .filter((t): t is AiSuggestedTodo => !!t && typeof t.content === 'string' && t.content.trim().length > 0)
      .map((t) => {
        const due = validIso(t.due_at);
        return {
          content: t.content.trim(),
          ...(t.description?.trim() ? { description: t.description.trim() } : {}),
          ...(due ? { due_at: due } : {}),
        };
      });

    const kind: AiFileAnalysis['kind'] =
      events.length && todos.length ? 'mixed' : events.length ? 'events' : todos.length ? 'todos' : 'none';

    return {
      kind,
      summary:
        parsed.summary?.trim() ||
        (kind === 'none' ? 'Không tìm thấy lịch hay công việc nào trong file này.' : 'Đã đọc xong file.'),
      events,
      todos,
    };
  }

  private async callGemini(
    userText: string,
    apiKey: string,
    context: AiChatContext,
  ): Promise<AiParsedIntent | null> {
    const now = new Date();
    // Giờ địa phương Việt Nam (UTC+7)
    const vnTimeStr = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(now);

    const eventsBlock =
      context.events.length > 0
        ? context.events
            .map((e) => {
              const range = e.allDay
                ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(
                    new Date(e.start),
                  )
                : `${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(e.start))} - ${new Intl.DateTimeFormat('vi-VN', { timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(e.end))}`;
              return `- "${e.title}" (${range}${e.location ? `, tại ${e.location}` : ''})`;
            })
            .join('\n')
        : '(không có sự kiện nào trong khoảng thời gian gần đây)';

    const historyBlock =
      context.history.length > 0
        ? context.history.map((h) => `${h.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${h.content}`).join('\n')
        : '(chưa có tin nhắn trước đó)';

    const systemPrompt = `Bạn là trợ lý AI lịch làm việc, có thể vừa TẠO SỰ KIỆN vừa TRÒ CHUYỆN tự nhiên (trả lời câu hỏi về lịch của người dùng hoặc trò chuyện chung) bằng tiếng Việt hoặc tiếng Anh — trả lời theo đúng ngôn ngữ người dùng đang dùng.
Thời điểm hiện tại: ${vnTimeStr} (ISO: ${now.toISOString()}). Múi giờ mặc định: Asia/Ho_Chi_Minh (+07:00).

Lịch của người dùng (các sự kiện gần đây, đã sắp theo thời gian):
${eventsBlock}

Lịch sử hội thoại gần nhất trong phiên chat này:
${historyBlock}

Nhiệm vụ: Đọc câu nói MỚI NHẤT của người dùng, xác định đúng MỘT trong bốn ý định sau, và trả về DUY NHẤT một JSON object (không thêm markdown hoặc text nào khác ngoài JSON):

1) Người dùng muốn TẠO một sự kiện/lịch hẹn mới (nói rõ hoặc ngầm hiểu được ngày/giờ):
{
  "intent": "create_event",
  "title": "tiêu đề sự kiện — CHỈ nội dung hoạt động chính, ngắn gọn tự nhiên. Loại bỏ hoàn toàn các từ/cụm mang tính yêu cầu-mệnh lệnh (vd \"tạo cho tôi\", \"giúp tôi\", \"nhắc tôi\", \"lên lịch\", \"thêm lịch\") và loại bỏ mọi cụm chỉ ngày/giờ đã được tách sang start_at/end_at (vd \"sáng mai\", \"9h\", \"thứ 2 tuần sau\") — không lặp lại chúng trong title.",
  "start_at": "ISO 8601 string có offset múi giờ +07:00 hoặc Z",
  "end_at": "ISO 8601 string (mặc định nếu không nói rõ thời lượng thì sau start_at 1 giờ)",
  "location": "địa điểm nếu có, hoặc rỗng",
  "description": "mô tả chi tiết nếu có, hoặc rỗng",
  "allDay": false,
  "attendees": ["danh sách tên hoặc email nếu có"],
  "recurrence_rule": null
}

2) Người dùng hỏi về lịch của họ (vd "hôm nay tôi có gì", "tuần sau rảnh không", "cuộc họp lúc mấy giờ") HOẶC chỉ đang trò chuyện/hỏi đáp chung (chào hỏi, hỏi kiến thức, tâm sự...) — KHÔNG có ý định tạo sự kiện mới:
{
  "intent": "chat",
  "reply": "câu trả lời tự nhiên, thân thiện, ngắn gọn (2-4 câu). Nếu là câu hỏi về lịch, dựa CHÍNH XÁC vào danh sách sự kiện ở trên để trả lời, không bịa thêm sự kiện không có trong danh sách."
}

3) Người dùng nêu một MỤC TIÊU hoặc KẾ HOẠCH cần chia thành nhiều việc nhỏ (vd "tôi muốn hoàn thành bài thuyết trình thứ Sáu", "lập kế hoạch cho chuyến đi Đà Lạt", "cần ôn thi Java trong 7 ngày", "chuẩn bị tổ chức sinh nhật") — tức là MỘT việc lớn phải tách ra nhiều bước, KHÁC với một cuộc hẹn tại một thời điểm:
{
  "intent": "create_todos",
  "goal": "tóm tắt mục tiêu trong 3-8 từ",
  "todos": [
    {
      "content": "tên việc ngắn gọn, bắt đầu bằng động từ, mỗi việc là một hành động làm được",
      "description": "giải thích ngắn nếu cần, hoặc bỏ trống",
      "due_at": "ISO 8601 +07:00 — CHỈ điền khi người dùng đã cho đủ dữ kiện thời gian để suy ra"
    }
  ]
}

QUY TẮC BẮT BUỘC cho "create_todos":
- Chỉ tạo việc LIÊN QUAN TRỰC TIẾP tới điều người dùng nói. Không thêm việc chung chung cho đầy danh sách.
- TUYỆT ĐỐI KHÔNG tự bịa deadline. Người dùng không nói thời gian thì bỏ trống "due_at" — để trống là đúng, đoán bừa là sai.
- Người dùng có cho mốc thời gian (vd "thứ Sáu", "trong 7 ngày", "trước 20/8") thì mới chia việc theo mốc đó.
- Yêu cầu càng chung chung thì việc càng phải ở mức bước cơ bản; không bịa chi tiết mà người dùng chưa hề nói.
- Sắp xếp theo trình tự làm trước – làm sau.
- Từ 3 đến 8 việc. Nhiều hơn sẽ quá tải người đọc.

4) Câu nói có vẻ muốn tạo sự kiện nhưng thiếu thông tin ngày/giờ rõ ràng để suy luận:
{ "intent": "unclear", "title": "tiêu đề đoán được (nếu có)" }

Chỉ trả về "unclear" khi thật sự không đủ dữ kiện tạo sự kiện — mọi câu hỏi/trò chuyện khác đều dùng "chat".`;

    // gemini-2.0-flash/1.5-flash/2.5-flash đã bị Google khai tử (404 NOT_FOUND) —
    // dùng alias "-latest" làm chính (luôn trỏ tới bản flash mới nhất) với một
    // bản ghim cụ thể làm dự phòng nếu alias đổi hành vi bất ngờ.
    const models = ['gemini-flash-latest', 'gemini-3.6-flash'];

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { parts: [{ text: `${systemPrompt}\n\nCâu người dùng (mới nhất, cần xử lý): "${userText}"` }] },
              ],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as GeminiResponse;
          const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJson) {
            const parsed = JSON.parse(rawJson) as AiParsedIntent;
            if (parsed.intent === 'create_event' && parsed.start_at) {
              if (!parsed.end_at) {
                const start = new Date(parsed.start_at);
                parsed.end_at = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
              }
              return parsed;
            }
            return parsed;
          }
        } else {
          // Trước đây lỗi HTTP bị nuốt lặng: key hỏng/hết hạn khiến toàn bộ AI
          // âm thầm rơi về bộ phân tích tiếng Việt cục bộ (chỉ tạo được sự
          // kiện, không chat, không chia việc) mà không có dấu hiệu gì.
          this.logger.warn(
            `Gemini trả lỗi ${response.status} cho model ${model}. Hết model dự phòng thì sẽ rơi về bộ phân tích cục bộ (chỉ tạo được sự kiện).`,
          );
        }
      } catch {
        // thử model tiếp theo nếu có lỗi
      }
    }

    return null;
  }

  /**
   * Bộ phân tích cú pháp tiếng Việt thông minh (Fallback NLP)
   * Giúp ứng dụng hoạt động ngay cả khi chưa cấu hình API key hoặc mất mạng
   */
  private parseLocalVietnameseEvent(text: string): AiParsedIntent {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // Việt Nam dùng múi giờ cố định +07:00 (không có giờ mùa hè), nhưng
    // new Date()/.setHours()/.toISOString() mặc định chạy theo timezone của
    // MÁY CHỦ NODE chứ không phải giờ Việt Nam. Trên máy dev hiện tại timezone
    // hệ thống tình cờ cũng là +07:00 nên không lộ ra, nhưng deploy lên server
    // (thường mặc định UTC) sẽ lệch hẳn 7 tiếng. Để không phụ thuộc timezone
    // máy chạy, toàn bộ tính toán bên dưới dùng một Date "giả UTC" mang đúng
    // giờ-theo-tường Việt Nam (cộng thêm 7 tiếng vào epoch thật), thao tác
    // bằng các hàm getUTC*/setUTC* (không phụ thuộc timezone hệ thống), rồi
    // mới quy đổi lại về UTC thật (trừ đúng 7 tiếng) khi xuất ISO string.
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const now = new Date(Date.now() + VN_OFFSET_MS);
    let targetDate = new Date(now);

    // 1. Phân tích ngày
    let dateMatched = false;

    // Hôm nay / Tối nay / Chiều nay / Sáng nay
    if (lower.includes('hôm nay') || lower.includes('tối nay') || lower.includes('chiều nay') || lower.includes('sáng nay')) {
      targetDate = new Date(now);
      dateMatched = true;
    } else if (lower.includes('ngày mai') || lower.includes('mai')) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
      dateMatched = true;
    } else if (lower.includes('ngày kia') || lower.includes('mốt') || lower.includes('ngày mốt')) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 2);
      dateMatched = true;
    }

    // Thứ 2 -> Thứ 7, Chủ nhật (ví dụ: "thứ 2 tuần sau", "thứ 6")
    const dayOfWeekMatch = lower.match(/(?:thứ|t)\s*([2-7]|hai|ba|tư|bốn|năm|sáu|bảy)|chủ nhật|cn/i);
    if (dayOfWeekMatch) {
      const dayMap: Record<string, number> = {
        '2': 1, hai: 1,
        '3': 2, ba: 2,
        '4': 3, tư: 3, bốn: 3,
        '5': 4, năm: 4,
        '6': 5, sáu: 5,
        '7': 6, bảy: 6,
        'chủ nhật': 0, cn: 0,
      };
      const dayKey = dayOfWeekMatch[1] ? dayOfWeekMatch[1].toLowerCase() : 'chủ nhật';
      const targetDay = dayMap[dayKey] ?? 1;
      const currentDay = targetDate.getUTCDay();
      let diff = targetDay - currentDay;
      if (lower.includes('tuần sau') || lower.includes('tuần tới')) {
        diff += 7;
      } else if (diff <= 0) {
        diff += 7; // nếu đã qua thứ đó trong tuần thì chuyển sang tuần sau
      }
      targetDate.setUTCDate(targetDate.getUTCDate() + diff);
      dateMatched = true;
    }

    // Ngày cụ thể dd/mm hoặc dd-mm
    const dateSpecificMatch = lower.match(/ngày\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?|(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))/);
    if (dateSpecificMatch) {
      const day = parseInt(dateSpecificMatch[1] || dateSpecificMatch[4], 10);
      const month = parseInt(dateSpecificMatch[2] || dateSpecificMatch[5], 10) - 1;
      const year = dateSpecificMatch[3] || dateSpecificMatch[6] ? parseInt(dateSpecificMatch[3] || dateSpecificMatch[6], 10) : now.getUTCFullYear();
      targetDate = new Date(Date.UTC(year, month, day));
      dateMatched = true;
    }

    // 2. Phân tích giờ (ví dụ: "9h", "9:30", "15 giờ", "8h tối", "3h chiều", "9h sáng")
    let hour = 9; // mặc định 9h sáng
    let minute = 0;
    let timeMatched = false;

    const timeMatch = lower.match(/(\d{1,2})(?:h|:| giờ\s*)(\d{1,2})?\s*(sáng|trưa|chiều|tối|am|pm)?/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const period = timeMatch[3]?.toLowerCase();

      if (period === 'chiều' || period === 'tối' || period === 'pm') {
        if (hour < 12) hour += 12;
      } else if (period === 'sáng' || period === 'am') {
        if (hour === 12) hour = 0;
      } else if (period === 'trưa' && hour === 12) {
        hour = 12;
      }
      timeMatched = true;
    } else if (lower.includes('buổi tối') || lower.includes('tối')) {
      hour = 20;
      timeMatched = true;
    } else if (lower.includes('buổi chiều') || lower.includes('chiều')) {
      hour = 14;
      timeMatched = true;
    } else if (lower.includes('buổi trưa') || lower.includes('trưa')) {
      hour = 12;
      timeMatched = true;
    } else if (lower.includes('buổi sáng') || lower.includes('sáng')) {
      hour = 8;
      timeMatched = true;
    }

    targetDate.setUTCHours(hour, minute, 0, 0);

    // Thời lượng (ví dụ: "trong 2 tiếng", "kéo dài 30 phút", "khoảng 1 giờ")
    let durationMinutes = 60;
    const durationMatch = lower.match(/(?:trong|khoảng|kéo dài)\s+(\d+)\s*(tiếng|giờ|phút|p)/i);
    if (durationMatch) {
      const val = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      if (unit.startsWith('tiếng') || unit.startsWith('giờ')) {
        durationMinutes = val * 60;
      } else {
        durationMinutes = val;
      }
    }

    const endDate = new Date(targetDate.getTime() + durationMinutes * 60 * 1000);

    // 3. Trích xuất địa điểm + tiêu đề sự kiện: bóc tách khỏi câu gốc từng
    // mảnh đã được nhận diện ở bước ngày/giờ/thời lượng phía trên (dùng lại
    // đúng phần text mà các match ở trên đã bắt được, không suy đoán thêm),
    // rồi mới lọc các từ mệnh lệnh/yêu cầu — để "tạo cho tôi lịch sáng mai 9h
    // tôi đi học" ra tiêu đề "Đi học" thay vì giữ nguyên cả câu.
    let titleSource = raw;
    let location: string | undefined;

    const locationMatch = titleSource.match(/(?:^|\s)(?:ở|tại)\s+(.+)$/i);
    if (locationMatch) {
      location = locationMatch[1].trim().replace(/[.,!?]+$/, '');
      location = location.charAt(0).toUpperCase() + location.slice(1);
      titleSource = titleSource.slice(0, locationMatch.index).trim();
    }

    // .replace(string, ...) so sánh phân biệt hoa/thường — trong khi các match
    // ở trên được bắt trên bản `lower`, nên nếu dùng thẳng chuỗi đó để replace
    // vào `titleSource` (giữ nguyên hoa/thường gốc) sẽ không khớp được đoạn
    // nằm ở đầu câu (viết hoa chữ cái đầu). Escape rồi dựng lại thành regex
    // "i" để việc bóc tách không phụ thuộc hoa/thường.
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripMatch = (matched: string) => {
      titleSource = titleSource.replace(new RegExp(escapeRegExp(matched), 'i'), ' ');
    };

    // Bóc giờ TRƯỚC ngày: timeMatch có thể "nuốt" luôn từ buổi đứng sau nó
    // (vd "9h sáng" bắt trọn cả "sáng"), nếu bóc cụm ngày "sáng mai" trước thì
    // phần "sáng" trong timeMatch sẽ không còn tồn tại để khớp nữa, để sót "9h".
    if (timeMatch) {
      stripMatch(timeMatch[0]);
    } else if (lower.includes('buổi tối') || lower.includes('tối')) {
      titleSource = titleSource.replace(/\bbuổi tối\b|\btối\b/gi, ' ');
    } else if (lower.includes('buổi chiều') || lower.includes('chiều')) {
      titleSource = titleSource.replace(/\bbuổi chiều\b|\bchiều\b/gi, ' ');
    } else if (lower.includes('buổi trưa') || lower.includes('trưa')) {
      titleSource = titleSource.replace(/\bbuổi trưa\b|\btrưa\b/gi, ' ');
    } else if (lower.includes('buổi sáng') || lower.includes('sáng')) {
      titleSource = titleSource.replace(/\bbuổi sáng\b|\bsáng\b/gi, ' ');
    }

    const DATE_PHRASE_RE =
      /\b(hôm nay|sáng nay|trưa nay|chiều nay|tối nay|ngày mai|sáng mai|trưa mai|chiều mai|tối mai|ngày mốt|ngày kia|mốt|mai)\b/gi;
    titleSource = titleSource.replace(DATE_PHRASE_RE, ' ');
    if (dayOfWeekMatch) stripMatch(dayOfWeekMatch[0]);
    titleSource = titleSource.replace(/\btuần sau\b|\btuần tới\b/gi, ' ');
    if (dateSpecificMatch) stripMatch(dateSpecificMatch[0]);
    if (durationMatch) stripMatch(durationMatch[0]);

    titleSource = titleSource.replace(/\b(lúc|vào)\b/gi, ' ').replace(/\bcó lịch\b|\bcó sự kiện\b/gi, ' ');

    // Bóc các cụm mệnh lệnh/yêu cầu ở đầu câu — lặp lại vì chúng thường ghép
    // với nhau (vd "Tạo" + "cho tôi" + "lịch" đứng liền nhau).
    const LEADING_FILLERS = [
      /^hãy\s+/i,
      /^làm ơn\s+/i,
      /^giúp tôi\s+/i,
      /^cho tôi\s+/i,
      /^nhắc nhở tôi\s+/i,
      /^nhắc tôi\s+/i,
      /^đặt lịch\s+/i,
      /^lên lịch\s+/i,
      /^tạo lịch\s+/i,
      /^tạo sự kiện\s+/i,
      /^thêm lịch\s+/i,
      /^thêm sự kiện\s+/i,
      /^vào lịch\s+/i,
      /^tạo\s+/i,
      /^thêm\s+/i,
      /^có\s+/i,
      /^hẹn\s+/i,
      /^lịch\s+/i,
      /^sự kiện\s+/i,
    ];
    let stripped = true;
    for (let guard = 0; stripped && guard < 6; guard++) {
      stripped = false;
      for (const pattern of LEADING_FILLERS) {
        const next = titleSource.replace(pattern, '');
        if (next !== titleSource) {
          titleSource = next;
          stripped = true;
          break;
        }
      }
    }
    // Chủ ngữ dư thừa còn sót lại đầu câu sau khi đã bỏ phần mệnh lệnh.
    titleSource = titleSource.replace(/^(?:tôi|mình|em|anh|chị)\s+/i, '');

    let title = titleSource.replace(/\s{2,}/g, ' ').trim().replace(/^[,.\-–]+|[,.\-–]+$/g, '').trim();

    // Sau khi đã bóc hết ngày/giờ/địa điểm/từ mệnh lệnh mà không còn nội dung
    // hoạt động nào (vd "9h sáng mai" — chỉ có giờ, không nói làm gì) thì
    // không tự lấy nguyên câu làm tiêu đề — coi như thiếu thông tin, để
    // người dùng xác nhận lại qua form nhập tay thay vì tạo tiêu đề tuỳ tiện.
    if (!title || title.length < 2) {
      return {
        intent: 'unclear',
        title: raw,
      };
    }

    // Viết hoa chữ cái đầu
    title = title.charAt(0).toUpperCase() + title.slice(1);

    if (!dateMatched && !timeMatched) {
      return {
        intent: 'unclear',
        title,
      };
    }

    // Không âm thầm tạo sự kiện trong quá khứ (vd nói "8h sáng nay" lúc đã là
    // 16h) — coi là chưa rõ ý định thay vì tự suy đoán, tái dùng route
    // "unclear" đã có sẵn để người dùng xác nhận/sửa lại qua form nhập tay.
    if (targetDate.getTime() < now.getTime()) {
      return {
        intent: 'unclear',
        title,
      };
    }

    // Quy đổi từ Date "giả UTC" (mang giờ Việt Nam) về đúng thời điểm UTC
    // thật trước khi xuất ISO string — xem giải thích ở đầu hàm.
    const toRealIso = (d: Date) => new Date(d.getTime() - VN_OFFSET_MS).toISOString();

    return {
      intent: 'create_event',
      title,
      start_at: toRealIso(targetDate),
      end_at: toRealIso(endDate),
      allDay: false,
      ...(location ? { location } : {}),
    };
  }
}

