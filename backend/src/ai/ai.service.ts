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

/** Trường bắt buộc mà câu nói KHÔNG cung cấp. Có phần tử nghĩa là chưa đủ
 *  dữ kiện để tạo sự kiện — phải hỏi lại người dùng, không được điền hộ. */
export type AiMissingField = 'date' | 'time' | 'title';

/**
 * Lịch lặp lại theo các thứ cố định trong tuần — kết quả của việc hiểu các
 * cách gọi tắt phổ biến ("246", "357", "thứ 2 4 6", "T3 T5 T7"...).
 *
 * `byWeekdays` theo đúng quy ước 0 = Chủ nhật .. 6 = Thứ Bảy — khớp với
 * `RecurrenceRuleDto.byWeekdays` ở backend/src/events/dto/recurrence-rule.dto.ts
 * VÀ khớp luôn với `Date.getDay()`/`getUTCDay()` của JavaScript, nên không
 * cần quy đổi ở bất kỳ đâu trong toàn bộ luồng.
 */
export interface AiWeeklyRecurrence {
  readonly freq: 'custom';
  readonly interval: 1;
  readonly unit: 'week';
  readonly byWeekdays: number[];
  /** Có mặt khi người dùng cho một khoảng NGÀY tường minh để giới hạn lịch
   *  lặp (vd "357 từ 13/07/2026 tới 29/08/2026") — vắng mặt thì lịch lặp
   *  không giới hạn ngày kết thúc (materialize tới trần an toàn ở backend:
   *  RECURRENCE_MAX_OCCURRENCES / RECURRENCE_HORIZON_YEARS). */
  readonly endType?: 'until';
  /** ISO 8601 — cuối ngày kết thúc theo giờ Việt Nam. Chỉ có khi endType
   *  là 'until'. */
  readonly until?: string;
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
  /** Có giá trị khi câu nói mô tả một lịch LẶP LẠI theo nhiều thứ cố định
   *  trong tuần (vd "lịch 246", "T2 T4 T6") — null khi chỉ là một sự kiện
   *  một lần. */
  recurrence_rule?: AiWeeklyRecurrence | null;
  /** Câu trả lời tự nhiên khi intent là 'chat' (hỏi về lịch hoặc trò chuyện chung). */
  reply?: string;
  /** Danh sách việc đề xuất khi intent là 'create_todos'. */
  todos?: AiSuggestedTodo[];
  /** Mục tiêu tóm tắt, dùng làm tiêu đề cho bảng xem trước. */
  goal?: string;
  /** Chỉ có ở "unclear": còn thiếu gì để tạo được sự kiện. */
  missingFields?: AiMissingField[];
  /** Giờ đã hiểu được dù chưa đủ ngày — để hỏi lại mà không bắt người
   *  dùng gõ lại từ đầu. "HH:mm" theo giờ Việt Nam. */
  startTime?: string;
  endTime?: string;
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

          // create_event mà KHÔNG có start_at nghĩa là model đã làm đúng: nó
          // hiểu người dùng muốn tạo lịch nhưng từ chối bịa ngày giờ. Rơi
          // xuống bộ phân tích cục bộ ở đây là phạt chính hành vi đúng đó —
          // nó sẽ tự đắp một mốc thời gian vào. Hỏi lại người dùng thay vì vậy.
          if (geminiResult.intent === 'create_event') {
            return {
              intent: 'unclear',
              title: geminiResult.title,
              missingFields: ['date'],
            };
          }
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

  /**
   * Lọc lại `recurrence_rule` do Gemini trả về trước khi tin dùng.
   *
   * Khác với các trường text (title, location...) — chỗ sai lệch cùng lắm là
   * hiển thị hơi kỳ — giá trị này đi thẳng vào `createSeries()` để ghi HÀNG
   * LOẠT sự kiện xuống CSDL, nên một hình dạng bịa/lệch (freq lạ, số thứ
   * ngoài 0-6, mảng rỗng...) phải bị loại bỏ hoàn toàn (coi như không lặp)
   * thay vì được dùng nguyên văn.
   */
  private sanitizeAiRecurrenceRule(raw: unknown): AiWeeklyRecurrence | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Partial<AiWeeklyRecurrence>;
    if (value.freq !== 'custom' || value.unit !== 'week') return null;
    if (!Array.isArray(value.byWeekdays)) return null;

    const byWeekdays = [
      ...new Set(
        value.byWeekdays.filter(
          (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
        ),
      ),
    ].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));

    if (byWeekdays.length === 0) return null;

    // "until" chỉ được tin khi parse ra một thời điểm hợp lệ — model có thể
    // trả về chuỗi rỗng, sai định dạng, hoặc quên gửi kèm endType.
    const until =
      value.endType === 'until' && typeof value.until === 'string' && !Number.isNaN(new Date(value.until).getTime())
        ? value.until
        : undefined;

    return {
      freq: 'custom',
      interval: 1,
      unit: 'week',
      byWeekdays,
      ...(until ? { endType: 'until' as const, until } : {}),
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
  "end_at": "ISO 8601 string — giờ kết thúc NGƯỜI DÙNG nói ra (vd \"từ 9h-17h\" thì đây là 17:00). Chỉ khi họ không nói giờ kết thúc lẫn thời lượng mới lấy sau start_at 1 giờ",
  "location": "địa điểm nếu có, hoặc rỗng",
  "description": "mô tả chi tiết nếu có, hoặc rỗng",
  "allDay": false,
  "attendees": ["danh sách tên hoặc email nếu có"],
  "recurrence_rule": "null NẾU là sự kiện MỘT LẦN. Nếu người dùng mô tả một lịch LẶP LẠI theo nhiều thứ cố định trong tuần (xem QUY TẮC LỊCH LẶP THEO THỨ bên dưới) thì điền { \"freq\": \"custom\", \"interval\": 1, \"unit\": \"week\", \"byWeekdays\": [<danh sách số, 0=Chủ nhật..6=Thứ Bảy>], \"endType\": \"until\" (CHỈ khi người dùng cho một khoảng ngày kết thúc tường minh), \"until\": \"<ISO 8601 — hết ngày kết thúc đó>\" }, và \"start_at\" là lần xuất hiện SỚM NHẤT của một trong các thứ đó — tính từ khoảng ngày người dùng cho (nếu có) hoặc từ hôm nay trở đi (nếu không có khoảng ngày)."
}

QUY TẮC LỊCH LẶP THEO THỨ (bắt buộc, hay gặp khi tạo lịch học/lịch làm):
- "246" / "lịch 246" / "thứ 246" / "thứ 2 4 6" / "thứ 2, 4, 6" / "T2 T4 T6" đều là CÙNG MỘT quy ước gọi tắt của sinh viên/dân văn phòng Việt Nam cho lịch lặp vào Thứ 2 + Thứ 4 + Thứ 6 (byWeekdays: [1,3,5]).
- "357" / "lịch 357" / "thứ 357" / "thứ 3 5 7" / "thứ 3, 5, 7" / "T3 T5 T7" là lịch lặp vào Thứ 3 + Thứ 5 + Thứ 7 (byWeekdays: [2,4,6]).
- "CN" / "cn" / "Chủ nhật" / "chủ nhật" đều là Chủ nhật (weekday = 0) — CHỈ dùng để xác định NGÀY, không tự ý biến thành lịch lặp lại nếu người dùng không nói gì thêm về việc lặp (vd "CN 9h họp nhóm" một mình, KHÔNG kèm khoảng ngày, là MỘT cuộc họp duy nhất vào Chủ nhật tới, recurrence_rule = null).
- CHỈ áp dụng cách hiểu "246"/"357" là ngày trong tuần khi câu nói đang nói về lịch học/lịch làm/lịch hẹn/ca học/ca làm/thời gian biểu/hoạt động lặp lại. TUYỆT ĐỐI KHÔNG áp dụng nếu rõ ràng đó là một con số thông thường khác (số tiền, số lượng, mã số, số điện thoại...) — ví dụ "tôi có 246 nghìn đồng" hay "mã đơn hàng 357" KHÔNG phải là ngày trong tuần.
- Khi đã xác định được recurrence_rule mà KHÔNG có khoảng ngày tường minh, "start_at" là lần xuất hiện SỚM NHẤT của một trong các thứ trong byWeekdays, tính từ "Thời điểm hiện tại" ở trên trở đi (kể cả hôm nay nếu hôm nay đúng là một trong các thứ đó).

QUY TẮC BẮT BUỘC khi câu nói CÓ CẢ nhóm/thứ trong tuần LẪN một khoảng ngày tường minh (vd "từ ngày 13/07/2026 tới 29/08/2026", "từ 01/09/2026 đến 30/11/2026" — định dạng Việt Nam dd/mm/yyyy, ngày đứng TRƯỚC tháng, TUYỆT ĐỐI không đọc nhầm "13/07/2026" thành tháng 13):
- Đây là lịch LẶP LẠI, GIỚI HẠN trong đúng khoảng ngày đó — không phải một sự kiện đơn và không phải thiếu thông tin ngày. TUYỆT ĐỐI không trả lời "chưa chắc chắn về thời gian" hay hỏi lại ngày bắt đầu/ngày kết thúc/các thứ trong tuần khi đã đọc được đầy đủ ba thứ này (nhóm thứ + ngày bắt đầu + ngày kết thúc).
- "start_at" = lần xuất hiện SỚM NHẤT của một trong các thứ trong byWeekdays, tính từ chính NGÀY BẮT ĐẦU người dùng cho (không phải từ hôm nay) — kể cả khi ngày đó đã qua so với "Thời điểm hiện tại", vì người dùng đã chủ động chỉ định khoảng ngày cụ thể.
- "endType": "until", "until" = 23:59:59 (+07:00) của chính NGÀY KẾT THÚC người dùng cho — để lần lặp cuối cùng rơi đúng vào ngày đó (nếu ngày đó khớp thứ cần lặp) vẫn được tính.
- Ngày bắt đầu phải <= ngày kết thúc. Chỉ hỏi lại khi khoảng ngày THỰC SỰ không hợp lệ (vd ngày kết thúc đứng trước ngày bắt đầu) hoặc không parse được — không phải vì nghi ngờ chung chung.
- CHƯA có giờ bắt đầu/kết thúc thì trả "unclear" với missingFields CHỈ gồm ["time"] (KHÔNG có "date") — nhóm thứ và khoảng ngày đã đủ rõ, chỉ còn thiếu giờ trong ngày. TUYỆT ĐỐI không dùng missingFields ["date"] hay câu "chưa chắc chắn về thời gian" trong trường hợp này.
- Tin nhắn TRƯỚC đã cho đủ nhóm thứ + khoảng ngày (AI đã hỏi lại giờ), tin nhắn NÀY chỉ trả lời giờ (vd "9h đến 11h") thì LẤY nhóm thứ + khoảng ngày đó từ lịch sử hội thoại, ghép với giờ vừa cho, trả về "create_event" NGAY — không hỏi lại bất cứ điều gì đã biết.

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

4) Câu nói muốn tạo sự kiện nhưng THIẾU ngày hoặc giờ, và KHÔNG suy ra được từ lịch sử hội thoại ở trên:
{ "intent": "unclear", "title": "tiêu đề đoán được", "missingFields": ["date"] hoặc ["time"] hoặc ["date","time"] — CHỈ liệt kê đúng những gì THỰC SỰ còn thiếu, "startTime": "HH:mm nếu đã hiểu được", "endTime": "HH:mm nếu đã hiểu được" }
- Ví dụ: đã có nhóm/thứ trong tuần + khoảng ngày bắt đầu/kết thúc nhưng chưa có giờ → missingFields CHỈ là ["time"], KHÔNG có "date".

QUY TẮC BẮT BUỘC cho thời gian (áp dụng cho cả "create_event" và "unclear"):
- KHOẢNG thời gian phải giữ NGUYÊN cả hai đầu. "từ 9h-17h", "9h đến 17h", "8h tới 10h30", "9 giờ đến 11 giờ", "1h chiều đến 5h chiều" — end_at lấy đúng giờ người dùng nói, KHÔNG cắt còn 1 tiếng.
- Chỉ dùng mặc định 1 giờ khi người dùng THỰC SỰ không nói giờ kết thúc và cũng không nói thời lượng.
- "từ ngày 13/07/2026 tới 29/08/2026" (có dấu / hoặc - giữa các số) là một KHOẢNG NGÀY, khác hẳn "từ 9h đến 17h" (một KHOẢNG GIỜ) — không được nhầm hai loại này với nhau, và không được coi khoảng ngày là "chưa rõ ngày".
- Người dùng KHÔNG nói ngày NÀO CẢ (không thứ, không khoảng ngày, không "hôm nay/mai"...) và lịch sử hội thoại cũng không có thì TRẢ VỀ "unclear" với missingFields ["date"] — TUYỆT ĐỐI không lấy hôm nay hay ngày bất kỳ. Điền "startTime"/"endTime" để không bắt người dùng gõ lại.
- Người dùng ĐÃ nói ngày (một ngày đơn, HOẶC một nhóm thứ + khoảng ngày — xem QUY TẮC LỊCH LẶP THEO THỨ ở trên) ở tin nhắn trước, tin nhắn này chỉ nói "thêm vào lịch" hoặc chỉ trả lời giờ, thì LẤY thông tin ngày/nhóm thứ/khoảng ngày đó từ lịch sử hội thoại, không hỏi lại.

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
              // Model có thể trả về một hình dạng sai lệch (freq lạ, số thứ
              // ngoài 0-6, byWeekdays rỗng...) — đây là dữ liệu sẽ đi thẳng
              // vào createSeries() để ghi hàng loạt xuống CSDL, nên phải lọc
              // lại chứ không tin nguyên văn như các trường text khác.
              parsed.recurrence_rule = this.sanitizeAiRecurrenceRule(parsed.recurrence_rule);
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
  /**
   * Đọc MỘT mốc giờ tiếng Việt bắt đầu từ vị trí `from` trong câu.
   *
   * Gom về một chỗ vì cùng một cách viết phải hiểu như nhau dù nó đứng một
   * mình ("lúc 9h") hay nằm trong một khoảng ("từ 9h đến 17h").
   *
   * Nhận: 9h · 9 giờ · 9:30 · 9h30 · 9 giờ 30 · 9 rưỡi · 9h rưỡi,
   * kèm buổi tuỳ chọn: sáng · trưa · chiều · tối · am · pm.
   */
  private parseClockAt(
    lower: string,
    from: number,
  ): { hour: number; minute: number; index: number; length: number } | null {
    // "h(?!\p{L})": chữ "h" phải KHÔNG có chữ cái đứng ngay sau nó. Thiếu rào
    // này thì "T6 học" (mã lịch "246"/nhóm thứ "T2 T4 T6" đứng sát một hoạt
    // động bắt đầu bằng "h" — "học", "họp", "hẹn"...) bị đọc nhầm số "6" +
    // chữ "h" đầu tiên của "học" thành mốc giờ "6h", trong khi câu không hề
    // nói giờ nào cả. Cần \u flag để \p{L} nhận diện được cả chữ cái có dấu.
    const re =
      /(\d{1,2})\s*(?:h(?!\p{L})|:|gi\u1EDD|(?=\s*r\u01B0\u1EE1i))\s*(?:(\d{1,2})|(r\u01B0\u1EE1i))?\s*(s\u00E1ng|tr\u01B0a|chi\u1EC1u|t\u1ED1i|am|pm)?/giu;
    re.lastIndex = from;
    const m = re.exec(lower);
    if (!m) return null;

    let hour = parseInt(m[1], 10);
    // "9 rưỡi" = 9 giờ 30. Không có nhánh này thì cụm đó không khớp gì cả và
    // regex trôi xuống bắt nhầm mốc giờ đứng SAU nó.
    const minute = m[3] ? 30 : m[2] ? parseInt(m[2], 10) : 0;
    if (hour > 23 || minute > 59) return null;

    const period = m[4] ? m[4].toLowerCase() : '';
    if (period === 'chi\u1EC1u' || period === 't\u1ED1i' || period === 'pm') {
      if (hour < 12) hour += 12;
    } else if (period === 's\u00E1ng' || period === 'am') {
      if (hour === 12) hour = 0;
    }

    return { hour, minute, index: m.index, length: m[0].length };
  }

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
    // Đưa lên đầu hàm (trước đây chỉ khai báo ở cuối, ngay trước return) vì
    // logic khoảng-ngày-tường-minh bên dưới cũng cần quy đổi "until" sang UTC
    // thật NGAY khi tính ra, không đợi tới cuối hàm.
    const toRealIso = (d: Date) => new Date(d.getTime() - VN_OFFSET_MS).toISOString();

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

    // Nhóm nhiều thứ ghép lại kiểu "246"/"357"/"thứ 2 4 6"/"T2 T4 T6" — PHẢI
    // xét TRƯỚC mốc thứ đơn ngay bên dưới: "thứ 2 4 6" cũng khớp một phần với
    // regex thứ đơn (bắt được "thứ 2" rồi bỏ qua "4 6" phía sau), nên nếu xét
    // sau thì câu này bị hiểu sai thành lịch một lần vào Thứ 2 thay vì lịch
    // lặp cả ba thứ.
    const weekdayGroup = this.parseWeekdayGroup(lower);

    // Thứ 2 -> Thứ 7, Chủ nhật (ví dụ: "thứ 2 tuần sau", "thứ 6", "CN") — bỏ
    // qua nếu câu đã được hiểu là một NHÓM nhiều thứ ở trên, để không bị ghi
    // đè nhầm về một mốc thứ đơn.
    const dayOfWeekMatch = weekdayGroup
      ? null
      : lower.match(/(?:thứ|t)\s*([2-7]|hai|ba|tư|bốn|năm|sáu|bảy)|chủ nhật|cn/i);

    // "Thứ trong tuần" quy về MỘT hình dạng chung — dù đến từ nhóm nhiều thứ
    // hay một thứ đơn — để khối khoảng-ngày bên dưới xử lý đồng nhất cho cả
    // hai (vd "CN từ 01/09 đến 30/09" và "357 từ 13/07 đến 29/08" đều là lịch
    // lặp giới hạn trong một khoảng ngày, chỉ khác số lượng thứ).
    let resolvedWeekdays: number[] | null = null;
    if (weekdayGroup) {
      resolvedWeekdays = weekdayGroup.weekdays;
    } else if (dayOfWeekMatch) {
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
      resolvedWeekdays = [dayMap[dayKey] ?? 1];
    }

    // Khoảng NGÀY tường minh ("từ ngày 13/07/2026 tới 29/08/2026") — khác hẳn
    // khoảng GIỜ ("từ 9h đến 17h") được nhận diện riêng ở bước 2 bên dưới.
    const dateRange = this.parseDateRange(lower, now);

    let recurrenceRule: AiWeeklyRecurrence | null = null;

    if (resolvedWeekdays && dateRange) {
      // Có ĐỦ nhóm/thứ trong tuần + khoảng ngày tường minh — coi là ĐỦ để
      // tạo lịch lặp GIỚI HẠN trong khoảng đó, không hỏi lại ngày. Lấy lần
      // xuất hiện sớm nhất TỪ NGÀY BẮT ĐẦU (không phải từ "hôm nay") — người
      // dùng đã chủ động chỉ định khoảng ngày cụ thể nên phải tôn trọng
      // nguyên văn, kể cả khi khoảng đó đã bắt đầu trong quá khứ.
      targetDate = this.nearestDateForWeekdays(dateRange.start, resolvedWeekdays);
      dateMatched = true;
      recurrenceRule = {
        freq: 'custom',
        interval: 1,
        unit: 'week',
        byWeekdays: resolvedWeekdays,
        endType: 'until',
        // Hết ngày kết thúc (23:59:59) — để lần lặp cuối rơi đúng vào ngày đó
        // (nếu ngày đó khớp thứ cần lặp) vẫn được tính, không bị cắt vì so
        // sánh theo mốc 00:00.
        until: toRealIso(this.endOfDay(dateRange.end)),
      };
    } else if (weekdayGroup) {
      // Nhóm nhiều thứ, KHÔNG kèm khoảng ngày — hành vi đã có: lặp từ lần
      // xuất hiện gần nhất, không giới hạn ngày kết thúc (backend tự chặn ở
      // RECURRENCE_MAX_OCCURRENCES / RECURRENCE_HORIZON_YEARS).
      targetDate = this.nearestDateForWeekdays(targetDate, weekdayGroup.weekdays);
      dateMatched = true;
      recurrenceRule = { freq: 'custom', interval: 1, unit: 'week', byWeekdays: weekdayGroup.weekdays };
    } else if (dayOfWeekMatch && resolvedWeekdays) {
      // Một thứ ĐƠN, không kèm khoảng ngày — HÀNH VI CŨ, giữ nguyên y hệt:
      // một sự kiện MỘT LẦN vào lần xuất hiện gần nhất của thứ đó.
      const targetDay = resolvedWeekdays[0];
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

    // Ngày cụ thể dd/mm hoặc dd-mm — bỏ qua nếu câu đã được hiểu là một
    // KHOẢNG ngày tường minh ở trên: dateRange.matchedText chứa CẢ hai đầu
    // mút (vd "13/07/2026" bên trong "từ ngày 13/07/2026 tới 29/08/2026"),
    // nên nếu vẫn chạy regex đơn này thì nó sẽ khớp trúng ngày ĐẦU của
    // khoảng rồi ghi đè targetDate đã được canh đúng thứ cần lặp ở trên
    // (vd Thứ 3 gần nhất từ 13/07 trở đi) về lại đúng 13/07 — có thể KHÔNG
    // phải một Thứ 3/5/7 nào cả.
    const dateSpecificMatch = dateRange
      ? null
      : lower.match(/ngày\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?|(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))/);
    if (dateSpecificMatch) {
      const day = parseInt(dateSpecificMatch[1] || dateSpecificMatch[4], 10);
      const month = parseInt(dateSpecificMatch[2] || dateSpecificMatch[5], 10) - 1;
      const year = dateSpecificMatch[3] || dateSpecificMatch[6] ? parseInt(dateSpecificMatch[3] || dateSpecificMatch[6], 10) : now.getUTCFullYear();
      targetDate = new Date(Date.UTC(year, month, day));
      dateMatched = true;
    }

    // 2. Phân tích giờ.
    //
    // Ưu tiên KHOẢNG trước mốc đơn: "từ 9h-17h" phải ra 9:00→17:00. Bản cũ
    // chỉ bắt một mốc rồi cộng cứng 1 tiếng, nên mọi câu có khoảng đều bị cắt
    // còn 60 phút và giờ kết thúc người dùng nói ra bị vứt đi.
    let hour = 9;
    let minute = 0;
    let timeMatched = false;
    let endHour: number | null = null;
    let endMinute = 0;
    /** Đoạn text của cả khoảng, để bóc khỏi tiêu đề sau này. */
    let rangeSpan: string | null = null;
    let singleTimeText: string | null = null;

    const RANGE_JOIN = /^\s*(?:-|–|—|→|->|đến|tới|cho đến|cho tới)\s*/i;

    for (let scan = 0; scan < lower.length; ) {
      const first = this.parseClockAt(lower, scan);
      if (!first) break;

      const afterFirst = first.index + first.length;
      const joiner = RANGE_JOIN.exec(lower.slice(afterFirst));
      if (joiner) {
        const second = this.parseClockAt(lower, afterFirst + joiner[0].length);
        // Mốc thứ hai phải nằm NGAY sau từ nối, không phải một con số nào đó
        // ở cuối câu.
        if (second && second.index === afterFirst + joiner[0].length) {
          hour = first.hour;
          minute = first.minute;
          endHour = second.hour;
          endMinute = second.minute;
          timeMatched = true;
          rangeSpan = raw.slice(first.index, second.index + second.length);
          break;
        }
      }

      // Không phải khoảng: giữ mốc đầu tiên tìm được làm giờ bắt đầu.
      hour = first.hour;
      minute = first.minute;
      timeMatched = true;
      singleTimeText = raw.slice(first.index, first.index + first.length);
      break;
    }

    // Buổi trong ngày, chỉ dùng khi câu không nêu mốc giờ nào.
    let periodOnly: RegExp | null = null;
    if (!timeMatched) {
      if (lower.includes('buổi tối') || lower.includes('tối')) {
        hour = 20; timeMatched = true; periodOnly = /\bbuổi tối\b|\btối\b/gi;
      } else if (lower.includes('buổi chiều') || lower.includes('chiều')) {
        hour = 14; timeMatched = true; periodOnly = /\bbuổi chiều\b|\bchiều\b/gi;
      } else if (lower.includes('buổi trưa') || lower.includes('trưa')) {
        hour = 12; timeMatched = true; periodOnly = /\bbuổi trưa\b|\btrưa\b/gi;
      } else if (lower.includes('buổi sáng') || lower.includes('sáng')) {
        hour = 8; timeMatched = true; periodOnly = /\bbuổi sáng\b|\bsáng\b/gi;
      }
    }

    targetDate.setUTCHours(hour, minute, 0, 0);

    // Lịch LẶP theo nhóm thứ ("246"/"357"...), KHÔNG kèm khoảng ngày tường
    // minh: nếu lần xuất hiện gần nhất khớp thứ lại rơi đúng HÔM NAY và giờ
    // đã trôi qua (vd hỏi "357 từ 13h đến 17h" lúc đã hơn 13h của một ngày
    // Thứ 5), đây KHÔNG phải một mốc giờ duy nhất đã lỡ như "8h sáng nay" —
    // đó là một chuỗi LẶP LẠI, nên chuyển sang lần xuất hiện kế tiếp (bỏ qua
    // hôm nay) thay vì để rào chắn "không tạo sự kiện quá khứ" bên dưới từ
    // chối oan cả yêu cầu. Làm ở ĐÂY (trước khi endDate được tính từ
    // targetDate) để endDate tự động ăn theo ngày mới, không bị lệch lại
    // đúng hôm nay.
    if (weekdayGroup && !dateRange && targetDate.getTime() < now.getTime()) {
      const tomorrow = new Date(targetDate);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      targetDate = this.nearestDateForWeekdays(tomorrow, weekdayGroup.weekdays);
      targetDate.setUTCHours(hour, minute, 0, 0);
    }

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

    let endDate: Date;
    if (endHour !== null) {
      // Giờ kết thúc do NGƯỜI DÙNG nói — tuyệt đối không đụng tới, kể cả khi
      // khoảng dài 8 tiếng.
      endDate = new Date(targetDate);
      endDate.setUTCHours(endHour, endMinute, 0, 0);
      if (endDate.getTime() <= targetDate.getTime()) {
        // "9h đến 5h" — người Việt nói giờ chiều theo lối 12 tiếng mà không
        // kèm "chiều". Đẩy sang buổi chiều nếu nhờ vậy mới thành khoảng hợp lệ.
        if (endHour < 12) {
          endDate.setUTCHours(endHour + 12, endMinute, 0, 0);
        }
        // Vẫn không hợp lệ thì đây là khoảng qua đêm.
        if (endDate.getTime() <= targetDate.getTime()) {
          endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        }
      }
    } else {
      endDate = new Date(targetDate.getTime() + durationMinutes * 60 * 1000);
    }

    // 3. Trích xuất địa điểm + tiêu đề sự kiện: bóc tách khỏi câu gốc từng
    // mảnh đã được nhận diện ở bước ngày/giờ/thời lượng phía trên (dùng lại
    // đúng phần text mà các match ở trên đã bắt được, không suy đoán thêm),
    // rồi mới lọc các từ mệnh lệnh/yêu cầu — để "tạo cho tôi lịch sáng mai 9h
    // tôi đi học" ra tiêu đề "Đi học" thay vì giữ nguyên cả câu.
    let titleSource = raw;
    let location: string | undefined;

    // Dung truoc moc gio/ngay: mau ".+" tham lam nen "hop o Phong B201 luc 9h"
    // từng cho ra địa điểm "Phòng B201 lúc 9h".
    const locationMatch = titleSource.match(
      /(?:^|\s)(?:ở|tại)\s+(.+?)(?=\s+(?:lúc|vào|từ|ngày|hôm|sáng|trưa|chiều|tối|thứ|\d{1,2}\s*(?:h|:|giờ))\b|$)/i,
    );
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

    // Bóc giờ TRƯỚC ngày: mốc giờ có thể "nuốt" luôn từ buổi đứng sau nó
    // (vd "9h sáng" bắt trọn cả "sáng"); bóc cụm ngày "sáng mai" trước thì
    // phần "sáng" đó không còn để khớp nữa và "9h" bị sót lại trong tiêu đề.
    if (rangeSpan) {
      // Cả khoảng, kể cả từ nối ở giữa — nếu chỉ bóc hai đầu thì tiêu đề còn
      // trơ lại "từ ... đến".
      stripMatch(rangeSpan);
      titleSource = titleSource.replace(/\btừ\s*$/i, ' ');
    } else if (singleTimeText) {
      stripMatch(singleTimeText);
    } else if (periodOnly) {
      titleSource = titleSource.replace(periodOnly, ' ');
    }

    // Từ nối còn trơ lại sau khi đã bóc mốc giờ ("... từ  đến ", "-").
    const CONNECTOR_LEFTOVER =
      /(^|\s)(từ|đến|tới|cho đến|cho tới|lúc|vào|khoảng)(?=\s|$)/gi;

    const DATE_PHRASE_RE =
      /\b(hôm nay|sáng nay|trưa nay|chiều nay|tối nay|ngày mai|sáng mai|trưa mai|chiều mai|tối mai|ngày mốt|ngày kia|mốt|mai)\b/gi;
    titleSource = titleSource.replace(DATE_PHRASE_RE, ' ');
    if (dayOfWeekMatch) stripMatch(dayOfWeekMatch[0]);
    if (weekdayGroup) stripMatch(weekdayGroup.matchedText);
    if (dateRange) stripMatch(dateRange.matchedText);
    titleSource = titleSource.replace(/\btuần sau\b|\btuần tới\b/gi, ' ');
    if (dateSpecificMatch) stripMatch(dateSpecificMatch[0]);
    if (durationMatch) stripMatch(durationMatch[0]);

    // Chạy hai lượt: bỏ "từ" xong thì "đến" mới lộ ra ở đầu khoảng trắng.
    titleSource = titleSource.replace(CONNECTOR_LEFTOVER, ' ').replace(CONNECTOR_LEFTOVER, ' ');
    titleSource = titleSource.replace(/\bcó lịch\b|\bcó sự kiện\b/gi, ' ');
    // Gạch nối trơ trọi giữa hai khoảng trắng, còn lại từ "9h - 17h".
    titleSource = titleSource.replace(/(^|\s)[-–—](?=\s|$)/g, ' ');

    // Bóc các cụm mệnh lệnh/yêu cầu ở đầu câu — lặp lại vì chúng thường ghép
    // với nhau (vd "Tạo" + "cho tôi" + "lịch" đứng liền nhau).
    const LEADING_FILLERS = [
      /^hãy\s+/i,
      // "Lên kế hoạch ..." là mệnh lệnh, không phải tên sự kiện. Thiếu mấy
      // dòng này thì nó chui thẳng vào tiêu đề.
      /^lên kế hoạch\s+/i,
      /^lập kế hoạch\s+/i,
      /^kế hoạch\s+/i,
      /^sắp xếp\s+/i,
      /^xếp lịch\s+/i,
      /^đặt\s+/i,
      /^lên\s+/i,
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
    const clock = (h: number, m: number) =>
      String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    const startTime = timeMatched ? clock(hour, minute) : undefined;
    const endTime =
      endHour !== null ? clock(endDate.getUTCHours(), endDate.getUTCMinutes()) : undefined;

    if (!title || title.length < 2) {
      return {
        intent: 'unclear',
        title: raw,
        missingFields: ['title'],
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
      };
    }

    // Viết hoa chữ cái đầu
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Thiếu NGÀY thì dừng lại và hỏi, tuyệt đối không lấy hôm nay làm mặc
    // định. "Đi học 9h-17h" không có nghĩa là hôm nay — trước đây câu này
    // lặng lẽ tạo sự kiện cho hôm nay, và nếu 9h đã trôi qua thì lại rơi vào
    // nhánh "quá khứ" bên dưới, hai đường đều sai theo kiểu khác nhau.
    if (!dateMatched || !timeMatched) {
      const missing: AiMissingField[] = [];
      if (!dateMatched) missing.push('date');
      if (!timeMatched) missing.push('time');
      return {
        intent: 'unclear',
        title,
        missingFields: missing,
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
      };
    }

    // Không âm thầm tạo sự kiện trong quá khứ (vd nói "8h sáng nay" lúc đã là
    // 16h) — coi là chưa rõ ý định thay vì tự suy đoán, tái dùng route
    // "unclear" đã có sẵn để người dùng xác nhận/sửa lại qua form nhập tay.
    //
    // BỎ QUA rào này khi người dùng đã cho một khoảng ngày TƯỜNG MINH
    // (dateRange): họ chủ động chỉ định "từ 13/07 tới 29/08", không phải suy
    // đoán mơ hồ như "sáng nay" — tôn trọng nguyên văn dù khoảng đó có bắt
    // đầu trong quá khứ so với "Thời điểm hiện tại" của trợ lý.
    if (targetDate.getTime() < now.getTime() && !dateRange) {
      return {
        intent: 'unclear',
        title,
        missingFields: ['date'],
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
      };
    }

    return {
      intent: 'create_event',
      title,
      start_at: toRealIso(targetDate),
      end_at: toRealIso(endDate),
      allDay: false,
      ...(location ? { location } : {}),
      ...(recurrenceRule ? { recurrence_rule: recurrenceRule } : {}),
    };
  }

  /** 0 = Chủ nhật .. 6 = Thứ Bảy — cùng quy ước với `Date.getUTCDay()` của
   *  JavaScript và với `RecurrenceRuleDto.byWeekdays` ở backend, nên không
   *  cần quy đổi ở bất kỳ bước nào trong luồng tạo lịch lặp. */
  private static readonly WEEKDAY_DIGIT_MAP: Record<string, number> = {
    '2': 1,
    '3': 2,
    '4': 3,
    '5': 4,
    '6': 5,
    '7': 6,
  };

  /** Đơn vị đo lường/tiền tệ/định danh hay gặp ngay sau một chuỗi 3 chữ số —
   *  có mặt thì gần như chắc chắn đó là một con số thông thường (giá tiền, số
   *  lượng...), không phải mã lịch "246"/"357". */
  private static readonly NON_SCHEDULE_UNIT_AFTER =
    /^\s*(nghìn|triệu|tỷ|đồng|vnđ|vnd|%|người|cuốn|quyển|chiếc|cái|kg|gam|lần|tuổi|điểm|trang|km|đô|usd)\b/i;

  /** "số 246", "mã 357" — số hiệu/mã định danh, không phải ngày trong tuần. */
  private static readonly NON_SCHEDULE_PREFIX_BEFORE = /(?:số|mã|stt|id|code)\s*$/i;

  /**
   * Gộp một danh sách chữ số thứ (2-7, theo `WEEKDAY_DIGIT_MAP`) thành mảng
   * thứ trong tuần đã loại trùng và sắp theo đúng thứ tự Thứ 2 → Chủ nhật.
   */
  private uniqueSortedWeekdays(digits: readonly string[]): number[] {
    const set = new Set(
      digits
        .map((d) => AiService.WEEKDAY_DIGIT_MAP[d])
        .filter((w): w is number => w !== undefined),
    );
    return [...set].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  }

  /**
   * Chuỗi 3 chữ số "246"/"357" đứng TRẦN TRỤI (không có "thứ"/"T" đứng
   * trước) có thật sự đang gọi lịch không, hay chỉ là một con số bình
   * thường (giá tiền, số lượng, mã đơn hàng, số điện thoại...)?
   *
   * Không thể phân biệt tuyệt đối bằng quy tắc — đây là suy đoán hợp lý dựa
   * trên ngữ cảnh NGAY SÁT chuỗi số, đúng tinh thần "không được áp dụng máy
   * móc nếu chuỗi số đó rõ ràng đang là một con số thông thường".
   */
  private isScheduleWeekdayCodeContext(lower: string, match: RegExpMatchArray): boolean {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    // ".246"/",246" mà ngay trước dấu chấm/phẩy lại là một chữ số khác — đây
    // chắc chắn là một phần của số lớn hơn có dấu phân cách hàng nghìn (vd
    // "12.246"), không phải mã lịch đứng một mình.
    const before2 = lower.slice(Math.max(0, start - 2), start);
    if (/\d[.,]$/.test(before2)) return false;

    const after = lower.slice(end, end + 14);
    if (AiService.NON_SCHEDULE_UNIT_AFTER.test(after)) return false;

    const beforeWord = lower.slice(Math.max(0, start - 6), start);
    if (AiService.NON_SCHEDULE_PREFIX_BEFORE.test(beforeWord)) return false;

    return true;
  }

  /**
   * Nhận diện các cách gọi tắt lịch lặp theo thứ trong tuần: mã số quen
   * thuộc với sinh viên/dân văn phòng Việt Nam ("246" = Thứ 2+4+6, "357" =
   * Thứ 3+5+7), và các biến thể liệt kê nhiều thứ ("thứ 2 4 6", "thứ 2, 4,
   * 6", "T2 T4 T6"...). Trả về danh sách thứ (0=CN..6=T7) đã loại trùng và
   * sắp theo thứ tự trong tuần, hoặc null nếu câu không nói tới dạng này.
   *
   * Biến thể có "thứ"/"T" đứng trước KHÔNG cần thêm rào chắn ngữ cảnh: không
   * ai viết "thứ" hay "T" ngay trước một con số thông thường không liên quan
   * tới lịch — bản thân tiền tố đã là tín hiệu đủ mạnh.
   */
  private parseWeekdayGroup(lower: string): { weekdays: number[]; matchedText: string } | null {
    // Cụm liệt kê có tiền tố — xét TRƯỚC mã số trần trụi bên dưới, để
    // "T2 T4 T6" không lỡ bị nhánh dưới nuốt mất một phần.
    const clusterMatch = lower.match(
      /(?:thứ|t)\s*[2-7](?:\s*[,、]?\s*(?:và|va)?\s*(?:thứ|t)?\s*[2-7]){1,2}/i,
    );
    if (clusterMatch) {
      const digits = [...clusterMatch[0].matchAll(/[2-7]/g)].map((m) => m[0]);
      const weekdays = this.uniqueSortedWeekdays(digits);
      if (weekdays.length >= 2) {
        return { weekdays, matchedText: clusterMatch[0] };
      }
    }

    // Mã số trần trụi: đúng 3 chữ số, mọi chữ số đều 2-7 (khớp Thứ 2..Thứ 7).
    // \b ở hai đầu đã tự loại các số dài hơn có "246"/"357" nằm bên trong (vd
    // "12463" không khớp vì không có ranh giới từ giữa "1" và "2").
    const packedMatch = lower.match(/\b([2-7]{3})\b/);
    if (packedMatch && this.isScheduleWeekdayCodeContext(lower, packedMatch)) {
      const digits = packedMatch[1].split('');
      const weekdays = this.uniqueSortedWeekdays(digits);
      if (weekdays.length >= 2) {
        return { weekdays, matchedText: packedMatch[0] };
      }
    }

    return null;
  }

  /**
   * Ngày GẦN NHẤT (tính từ `base` trở đi, kể cả chính `base`) mà thứ trong
   * tuần nằm trong `weekdays`. Dùng khi câu chỉ nói "lịch 246" mà không kèm
   * mốc ngày cụ thể nào khác — lịch lặp phải bắt đầu từ lần xuất hiện sớm
   * nhất, không phải một ngày ngẫu nhiên.
   *
   * `base` là Date "giả UTC" mang giờ Việt Nam (xem giải thích ở đầu
   * `parseLocalVietnameseEvent`) nên dùng getUTCDay()/setUTCDate() — không
   * phụ thuộc timezone máy chạy.
   */
  private nearestDateForWeekdays(base: Date, weekdays: readonly number[]): Date {
    const set = new Set(weekdays);
    const result = new Date(base);
    for (let i = 0; i < 7; i++) {
      if (set.has(result.getUTCDay())) return result;
      result.setUTCDate(result.getUTCDate() + 1);
    }
    // Không thể xảy ra (weekdays luôn có ít nhất 1 phần tử hợp lệ 0-6), nhưng
    // TypeScript cần một nhánh trả về để hàm luôn có kiểu Date.
    return result;
  }

  /**
   * Khoảng NGÀY tường minh: "từ (ngày )?dd/mm(/yyyy)? (đến|tới|cho đến|cho
   * tới) (ngày )?dd/mm(/yyyy)?" — ví dụ "từ ngày 13/07/2026 tới 29/08/2026",
   * "từ 01/09/2026 đến 30/11/2026".
   *
   * Phân biệt được với khoảng GIỜ ("từ 9h đến 17h") nhờ dấu `/` hoặc `-`
   * BẮT BUỘC giữa ngày/tháng — một mốc giờ tiếng Việt không bao giờ viết
   * theo dạng đó, nên hai loại khoảng này không bao giờ khớp nhầm vào nhau.
   *
   * Định dạng CỐ ĐỊNH là dd/mm/yyyy (ngày đứng trước) — nhóm bắt số 1 luôn
   * là ngày, nhóm số 2 luôn là tháng, không được đọc ngược thành mm/dd.
   *
   * Năm bị bỏ trống ở một đầu thì mượn năm của đầu kia; bỏ trống cả hai thì
   * lấy năm hiện tại — cùng tinh thần khoan dung với `dateSpecificMatch`.
   *
   * Trả về null nếu không khớp, không parse được, hoặc ngày bắt đầu đứng SAU
   * ngày kết thúc (Bước 3: startDate phải <= endDate).
   */
  private parseDateRange(
    lower: string,
    now: Date,
  ): { start: Date; end: Date; matchedText: string } | null {
    const match = lower.match(
      /từ\s*(?:ngày\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\s*(?:đến|tới|cho đến|cho tới)\s*(?:ngày\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/i,
    );
    if (!match) return null;

    const [, d1, m1, y1, d2, m2, y2] = match;
    const year1 = y1 ? parseInt(y1, 10) : y2 ? parseInt(y2, 10) : now.getUTCFullYear();
    const year2 = y2 ? parseInt(y2, 10) : year1;

    const start = new Date(Date.UTC(year1, parseInt(m1, 10) - 1, parseInt(d1, 10)));
    const end = new Date(Date.UTC(year2, parseInt(m2, 10) - 1, parseInt(d2, 10)));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (start.getTime() > end.getTime()) return null;

    return { start, end, matchedText: match[0] };
  }

  /** 23:59:59.999 cùng ngày (Date "giả UTC" mang giờ Việt Nam) — để lần lặp
   *  cuối cùng rơi vào bất kỳ giờ nào trong NGÀY kết thúc vẫn được tính, thay
   *  vì bị cắt vì so sánh theo đúng mốc 00:00:00. */
  private endOfDay(date: Date): Date {
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }
}

