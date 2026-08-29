import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { EventsService } from '../events/events.service';
import { EventDto } from '../events/event.mapper';
import { TodosService } from '../todos/todos.service';
import { TodoListsService } from '../todos/todo-lists.service';
import { TodoDto } from '../todos/todo.mapper';
import { NotesService } from '../notes/notes.service';
import { NoteDto } from '../notes/note.mapper';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { GroupsService } from '../groups/groups.service';
import { GroupRole, canInvite, canManage } from '../groups/group-role';
import {
  AiService,
  AiEventActionIntent,
  AiTodoActionIntent,
  AiNoteActionIntent,
  AiGroupActionIntent,
  AiLastRelevantEntity,
} from './ai.service';
import { AiChatDto, AiChatHistoryEntryDto, AiPendingActionDto } from './dto/ai-chat.dto';
import { AiFileImportService } from '../import/services/ai-file-import.service';
import { MulterExceptionFilter } from '../common/multer-exception.filter';
import {
  AI_FILE_FORMATS_LABEL,
  ALLOWED_AI_FILE_EXTENSIONS,
  HEAVY_OPERATION_RATE_LIMIT,
  MULTER_FILE_SIZE_LIMIT,
  hasAllowedExtension,
} from '../common/limits';

/** Câu trả lời BẮT BUỘC khi thành viên không đủ quyền yêu cầu một thao tác
 *  quản trị nhóm qua AI — nguyên văn, không được đổi chữ nào. */
const GROUP_PERMISSION_DENIED_REPLY = 'Bạn tôi ơi, đã bao giờ xem lại vị trí của mình chưa?';
/** Câu trả lời BẮT BUỘC khi người dùng chưa thuộc nhóm nào mà lại yêu cầu thao
 *  tác nhóm — nguyên văn, không được đổi chữ nào. */
const NO_GROUP_REPLY = 'Bạn chưa có nhóm kìa, hãy tạo nhóm đi rồi quay lại đây nhé';

/** Đối chiếu `targetMatch` (đoạn text model nghĩ là khớp) với danh sách thật.
 *  KHÔNG tin một id do model tự bịa — id thật luôn lấy từ `items`, danh sách đã
 *  được fetch bằng chính supabase client (RLS) của người gọi.
 *
 *  - Rỗng/không có → lấy mục đầu tiên (danh sách luôn sắp mới-nhất-trước) —
 *    khớp với "vừa tạo/gần nhất".
 *  - Khớp chính xác (không phân biệt hoa/thường) → dùng luôn.
 *  - Khớp một phần (chứa nhau) mà chỉ ra đúng MỘT ứng viên → dùng.
 *  - Còn lại (không khớp, hoặc khớp nhiều hơn một) → null, để tầng gọi hỏi lại
 *    thay vì đoán bừa. */
function matchByContent<T>(items: T[], targetMatch: string | undefined, getText: (item: T) => string): T | null {
  if (items.length === 0) return null;
  const needle = (targetMatch ?? '').trim().toLowerCase();
  if (!needle) return items[0];

  const exact = items.find((item) => getText(item).trim().toLowerCase() === needle);
  if (exact) return exact;

  const partial = items.filter((item) => {
    const text = getText(item).trim().toLowerCase();
    return text.includes(needle) || needle.includes(text);
  });
  return partial.length === 1 ? partial[0] : null;
}

/** Tìm nhóm được nhắc tới trong câu gốc bằng cách so tên nhóm (không phân biệt
 *  hoa/thường) có xuất hiện trong câu hay không. Chỉ nhận khi khớp đúng MỘT
 *  nhóm — khớp nhiều nhóm cùng lúc thì coi như không xác định được, an toàn
 *  hơn là đoán bừa. */
function matchGroupInMessage<T extends { name: string }>(groups: T[], message: string): T | null {
  const lower = message.toLowerCase();
  const matches = groups.filter((g) => g.name && lower.includes(g.name.toLowerCase()));
  if (matches.length === 1) return matches[0];
  return groups.length === 1 ? groups[0] : null;
}

/** Người dùng muốn HUỶ hành động đang chờ ("hủy", "thôi", "bỏ đi"...) — chỉ
 *  khớp khi cả câu CHỈ LÀ một từ/cụm huỷ, không khớp một câu dài có lẫn những
 *  chữ đó (vd "thôi để mai tạo ghi chú đi học" KHÔNG phải lệnh huỷ). */
const CANCEL_WORDS_RE =
  /^(hủy|huỷ|thôi|bỏ đi|bỏ|không tạo nữa|không cần nữa|không làm nữa|dừng lại|dừng|không muốn nữa)[.!\s]*$/i;
function isCancelWord(text: string): boolean {
  return CANCEL_WORDS_RE.test(text.trim());
}

@Controller('ai')
@UseGuards(SupabaseAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly eventsService: EventsService,
    private readonly todosService: TodosService,
    private readonly todoListsService: TodoListsService,
    private readonly notesService: NotesService,
    private readonly groupsService: GroupsService,
    private readonly fileImport: AiFileImportService,
  ) {}

  @Post('chat')
  // Ghi đè throttler 'default' cho riêng route này: 20 lượt chat AI mỗi giờ.
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async chat(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: AiChatDto,
  ) {
    // BẮT BUỘC kiểm tra pending action TRƯỚC bất kỳ bước nhận diện ý định nào
    // — nếu không, câu trả lời cho một câu hỏi đang chờ ("Test AI" trả lời cho
    // "Bạn muốn ghi chú nội dung gì?") sẽ bị chạy qua toàn bộ luồng phân loại ý
    // định từ đầu như một tin nhắn độc lập, và có thể rơi vào "chat"/lời chào
    // chung chung thay vì được hiểu đúng là dữ liệu điền tiếp cho action đang
    // dở. Xem AiPendingActionDto để biết vì sao trạng thái này nằm ở CLIENT
    // (echo lại) chứ không lưu ở server.
    if (dto.pendingAction) {
      if (isCancelWord(dto.message)) {
        return {
          intent: 'chat' as const,
          reply: 'Đã huỷ yêu cầu trước đó, không tạo gì cả.',
          pendingAction: null,
        };
      }
      return this.resumePendingAction(supabase, user, dto.pendingAction, dto.message, dto.calendarId);
    }

    return this.processMessage(
      supabase,
      user,
      dto.message,
      dto.calendarId,
      dto.history ?? [],
      dto.lastRelevantEntity,
    );
  }

  /**
   * Tiếp tục MỘT hành động đang chờ dữ liệu (pending action) bằng chính câu
   * người dùng vừa gõ — coi TOÀN BỘ câu đó là giá trị điền vào field còn
   * thiếu, KHÔNG chạy lại intent detection (không gọi Gemini để "đoán ý định
   * mới" cho ba loại note/todo/group — chỉ event mới cần Gemini để hiểu ngày
   * giờ tự nhiên, và dùng lại đúng `processMessage()` cho việc đó thay vì viết
   * lại bộ hiểu ngày/giờ).
   */
  private async resumePendingAction(
    supabase: SupabaseClient,
    user: User,
    pending: AiPendingActionDto,
    message: string,
    calendarId: string,
  ) {
    const answer = message.trim();

    if (pending.type === 'note') {
      if (!answer) {
        return {
          intent: 'chat' as const,
          reply: 'Bạn muốn ghi chú nội dung gì? Nói rõ giúp mình nhé.',
          pendingAction: pending,
        };
      }
      const created = await this.notesService.create(supabase, user.id, {
        content: answer,
        color: 'yellow',
      });
      return {
        intent: 'note_action' as const,
        action: 'create' as const,
        note: created,
        reply: `Đã tạo ghi chú "${created.content}".`,
        pendingAction: null,
      };
    }

    if (pending.type === 'todo') {
      if (!answer) {
        return {
          intent: 'chat' as const,
          reply: 'Bạn muốn tạo việc gì? Nói rõ nội dung giúp mình nhé.',
          pendingAction: pending,
        };
      }
      const listId = await this.ensureDefaultTodoList(supabase, user.id);
      const created = await this.todosService.create(supabase, user.id, { content: answer, listId });
      return {
        intent: 'todo_action' as const,
        action: 'create' as const,
        todo: created,
        reply: `Đã thêm việc "${created.content}" vào việc cần làm.`,
        pendingAction: null,
      };
    }

    if (pending.type === 'group') {
      if (!answer) {
        return {
          intent: 'chat' as const,
          reply: 'Bạn chưa cho mình biết — nói lại giúp mình nhé.',
          pendingAction: pending,
        };
      }
      // Gộp dữ liệu đã có (collected) với câu trả lời vừa rồi vào đúng field
      // đang thiếu, rồi chạy lại TOÀN BỘ luồng kiểm tra quyền của
      // handleGroupAction — không bỏ qua bước kiểm tra quyền chỉ vì đang ở
      // giữa một hành động nhiều lượt.
      const merged = {
        ...(pending.collected as Record<string, unknown> | undefined),
        [pending.missingField]: answer,
      } as unknown as AiGroupActionIntent;
      return this.handleGroupAction(supabase, user, merged);
    }

    if (pending.type === 'event') {
      if (!answer) {
        return {
          intent: 'chat' as const,
          reply: 'Bạn chưa cho mình biết — nói lại giúp mình nhé.',
          pendingAction: pending,
        };
      }
      // Ghép lại thành MỘT câu đầy đủ ("<tiêu đề> lúc <giờ đã biết> <câu trả
      // lời mới>") rồi tái dùng đúng processMessage() — bộ hiểu ngày/giờ tự
      // nhiên (Gemini + fallback cục bộ) đã có sẵn ở đó, không viết lại.
      const collected = (pending.collected ?? {}) as {
        title?: string;
        startTime?: string;
        endTime?: string;
      };
      const parts = [
        collected.title,
        collected.startTime
          ? `lúc ${collected.startTime}${collected.endTime ? ` đến ${collected.endTime}` : ''}`
          : '',
        answer,
      ].filter((p): p is string => !!p && p.trim().length > 0);
      const synthesized = parts.join(' ').trim() || answer;
      return this.processMessage(supabase, user, synthesized, calendarId, []);
    }

    // Loại pending lạ (không nên xảy ra) — bỏ qua thay vì kẹt cứng, xử lý như
    // một tin nhắn hoàn toàn mới.
    return this.processMessage(supabase, user, message, calendarId, []);
  }

  /** Luồng chính: nạp ngữ cảnh (lịch/việc/ghi chú), nhận diện ý định từ đầu
   *  bằng AiService, rồi gọi đúng service thật tương ứng. Chỉ chạy khi KHÔNG
   *  có pending action đang chờ — xem chat()/resumePendingAction() ở trên.
   *
   *  Smart context loading: chỉ load todos/notes khi câu hỏi hoặc ngữ cảnh gần
   *  đây thực sự liên quan — tránh 3 DB query cho mọi request kể cả câu chào
   *  hỏi đơn giản. Events luôn được load vì cần cho hầu hết intent. */
  private async processMessage(
    supabase: SupabaseClient,
    user: User,
    message: string,
    calendarId: string,
    history: AiChatHistoryEntryDto[],
    lastRelevantEntity?: AiLastRelevantEntity,
  ) {
    // Ngữ cảnh lịch: toàn bộ sự kiện người dùng có quyền xem (RLS lọc sẵn qua
    // supabase client theo user), giới hạn về một cửa sổ gần "hiện tại" và cắt
    // bớt số lượng để prompt không phình to vô hạn với người dùng nhiều sự kiện.
    //
    // Smart loading: events luôn load (cần cho hầu hết intent). Todos/notes chỉ
    // load khi message hoặc history gần đây thực sự liên quan, để tránh 3 DB
    // query cho mọi request kể cả câu chào hỏi đơn giản.
    const RECENT_WINDOW = 6; // số turns gần nhất xét để quyết định load todos/notes
    const needsTodos = this.contextNeedsTodos(message, history, lastRelevantEntity);
    const needsNotes = this.contextNeedsNotes(message, history, lastRelevantEntity);

    const [allEvents, rawTodos, rawNotes] = await Promise.all([
      this.eventsService
        .findAll(supabase, user.id)
        .catch(() => [] as EventDto[]),
      needsTodos
        ? this.todosService
            .findAllForUser(supabase)
            .catch(() => [] as Awaited<ReturnType<typeof this.todosService.findAllForUser>>)
        : Promise.resolve([] as Awaited<ReturnType<typeof this.todosService.findAllForUser>>),
      needsNotes
        ? this.notesService
            .findAllForUser(supabase)
            .catch(() => [] as Awaited<ReturnType<typeof this.notesService.findAllForUser>>)
        : Promise.resolve([] as Awaited<ReturnType<typeof this.notesService.findAllForUser>>),
    ]);
    void RECENT_WINDOW; // documented above, used via contextNeedsTodos/Notes
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const windowEnd = now + 30 * 24 * 60 * 60 * 1000;
    const eventsInWindow = allEvents
      .filter((e) => {
        const start = new Date(e.start).getTime();
        return start >= windowStart && start <= windowEnd;
      })
      .slice(0, 60);
    const events = eventsInWindow.map((e) => ({
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      ...(e.location ? { location: e.location } : {}),
    }));

    const openTodos = rawTodos.filter((t) => !t.done).slice(0, 30);
    const todos = openTodos.map((t) => ({
      content: t.content,
      done: t.done,
      ...(t.dueAt ? { dueAt: t.dueAt } : {}),
    }));

    const recentNotes = rawNotes.slice(0, 20);
    const notes = recentNotes.map((n) => ({ content: n.content }));

    const parsed = await this.aiService.chat(message, {
      events,
      todos,
      notes,
      history,
      ...(lastRelevantEntity ? { lastRelevantEntity } : {}),
    });

    // Lưu lịch sử chat — best-effort, không chặn phản hồi nếu insert lỗi.
    await supabase.from('ai_conversations').insert({
      user_id: user.id,
      messages: [
        { role: 'user', content: message },
        { role: 'assistant', content: JSON.stringify(parsed) },
      ],
    });

    // Quy tắc cứng, KHÔNG giao cho model tự quyết: câu không nhắc "nhóm"/"group"
    // luôn thuộc phạm vi cá nhân. Ghi chú/Việc cần làm không có group_id trong
    // schema nên tuyệt đối không đụng vào chúng khi câu có nhắc nhóm — model đã
    // được dặn trong prompt, đây là lớp chặn thứ hai để chắc chắn 100%.
    const mentionsGroup = /\bnh[oó]m\b|\bgroup\b/i.test(message);
    if (mentionsGroup && (parsed.intent === 'todo_action' || parsed.intent === 'note_action')) {
      return {
        intent: 'chat' as const,
        reply:
          parsed.intent === 'todo_action'
            ? 'Việc cần làm hiện chỉ hỗ trợ quản lý cá nhân, chưa hỗ trợ theo nhóm.'
            : 'Ghi chú hiện chỉ hỗ trợ quản lý cá nhân, chưa hỗ trợ theo nhóm.',
      };
    }
    if (!mentionsGroup && parsed.intent === 'group_action') {
      // Model trả group_action mà câu gốc không hề nhắc nhóm — không tin, hỏi
      // lại thay vì liều thực hiện một thao tác quản trị nhóm.
      return {
        intent: 'chat' as const,
        reply: 'Bạn có thể nói rõ đang muốn thao tác với nhóm nào không?',
      };
    }

    if (parsed.intent === 'event_action' && parsed.event_action) {
      return this.handleEventAction(supabase, user, parsed.event_action, eventsInWindow);
    }
    if (parsed.intent === 'todo_action' && parsed.todo_action) {
      return this.handleTodoAction(supabase, user, parsed.todo_action, openTodos);
    }
    if (parsed.intent === 'note_action' && parsed.note_action) {
      return this.handleNoteAction(supabase, user, parsed.note_action, recentNotes);
    }
    if (parsed.intent === 'group_action' && parsed.group_action) {
      return this.handleGroupAction(supabase, user, parsed.group_action);
    }

    if (parsed.intent === 'create_event' && parsed.title && parsed.start_at && parsed.end_at) {
      let effectiveCalendarId = calendarId;
      if (mentionsGroup) {
        // "tạo lịch họp cho nhóm X" — trỏ sang đúng lịch của nhóm đó thay vì
        // lịch cá nhân mặc định. Không tìm được nhóm khớp thì vẫn tạo vào lịch
        // cá nhân như hành vi cũ — không chặn hẳn chỉ vì không đoán được nhóm.
        const groups = await this.groupsService.findAllForUser(supabase, user);
        const matchedGroup = matchGroupInMessage(groups, message);
        if (matchedGroup) effectiveCalendarId = matchedGroup.calendarId;
      }
      const baseDto = {
        calendarId: effectiveCalendarId,
        title: parsed.title,
        start: parsed.start_at,
        end: parsed.end_at,
        allDay: false,
        ...(parsed.location ? { location: parsed.location } : {}),
      };

      // Câu nói mô tả một lịch LẶP LẠI theo nhiều thứ cố định (vd "lịch 246",
      // "T3 T5 T7") — vật chất hoá cả chuỗi qua createSeries() (đúng cơ chế
      // form tạo sự kiện thủ công đã dùng cho lịch lặp) thay vì chỉ lưu một
      // sự kiện đơn lẻ vào đúng thứ đầu tiên rồi bỏ quên các thứ còn lại.
      if (parsed.recurrence_rule) {
        const events = await this.eventsService.createSeries(
          supabase,
          { ...baseDto, recurrenceRule: parsed.recurrence_rule },
          user.id,
        );
        // `event` (số ít) giữ lại cho tương thích ngược với client cũ/thẻ sự
        // kiện chỉ hiển thị MỘT lần xuất hiện; `events` (đầy đủ) để client
        // mới cập nhật lịch và báo đúng số lượng đã tạo.
        return { intent: 'create_event' as const, event: events[0], events };
      }

      const event = await this.eventsService.create(supabase, baseDto, user.id);
      return { intent: 'create_event' as const, event };
    }

    // CỐ Ý chỉ trả về danh sách, KHÔNG lưu. Người dùng phải xem và chọn ở
    // bước xem trước rồi mới ghi vào "Việc cần làm" — khác hẳn create_event
    // ở trên vốn lưu ngay vì đó là một hành động dứt khoát, còn đây là một
    // bản nháp nhiều mục cần được duyệt.
    if (parsed.intent === 'create_todos' && parsed.todos?.length) {
      return {
        intent: 'create_todos' as const,
        goal: parsed.goal ?? '',
        todos: parsed.todos,
      };
    }

    if (parsed.intent === 'chat' && parsed.reply) {
      return { intent: 'chat' as const, reply: parsed.reply };
    }

    // Chuyển tiếp NGUYÊN VẸN phần đã hiểu được: frontend cần biết còn thiếu
    // gì để hỏi đúng câu, và biết giờ nào đã nắm được để khỏi bắt người dùng
    // gõ lại từ đầu.
    return {
      intent: 'unclear' as const,
      title: parsed.title,
      message: message,
      ...(parsed.missingFields?.length ? { missingFields: parsed.missingFields } : {}),
      ...(parsed.startTime ? { startTime: parsed.startTime } : {}),
      ...(parsed.endTime ? { endTime: parsed.endTime } : {}),
    };
  }

  /** Sửa/xoá một sự kiện đã tồn tại — khớp `target_match` với danh sách sự
   *  kiện đã nạp làm ngữ cảnh cho model (cùng danh sách, để không lệch với
   *  điều model đã "nhìn thấy"). */
  private async handleEventAction(
    supabase: SupabaseClient,
    user: User,
    action: AiEventActionIntent,
    events: EventDto[],
  ) {
    const target = matchByContent(events, action.target_match, (e) => e.title);
    if (!target) {
      return {
        intent: 'chat' as const,
        reply: 'Mình chưa xác định được chính xác sự kiện nào — bạn nói rõ tên sự kiện giúp mình nhé.',
      };
    }

    if (action.action === 'delete') {
      await this.eventsService.remove(supabase, target.id);
      return {
        intent: 'event_action' as const,
        action: 'delete' as const,
        eventId: target.id,
        reply: `Đã xoá sự kiện "${target.title}".`,
      };
    }

    const changes = action.changes ?? {};
    const updated = await this.eventsService.update(
      supabase,
      target.id,
      {
        ...(changes.title ? { title: changes.title } : {}),
        ...(changes.start_at ? { start: changes.start_at } : {}),
        ...(changes.end_at ? { end: changes.end_at } : {}),
        ...(changes.location !== undefined ? { location: changes.location } : {}),
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        ...(changes.allDay !== undefined ? { allDay: changes.allDay } : {}),
      },
      user.id,
    );
    return {
      intent: 'event_action' as const,
      action: 'update' as const,
      event: updated,
      reply: `Đã cập nhật sự kiện "${updated.title}".`,
    };
  }

  /**
   * Kiểm tra xem request hiện tại có thực sự cần context todos không.
   *
   * - Nếu lastRelevantEntity là todo → cần load (câu follow-up sửa/xoá todo).
   * - Nếu message chứa keyword liên quan todo → load.
   * - Nếu 6 turns gần nhất của history nhắc tới todo action → load.
   * - Không xét toàn bộ history để tránh một todo cũ nhiều turn trước làm mọi
   *   request sau đều phải load todos.
   */
  private contextNeedsTodos(
    message: string,
    history: AiChatHistoryEntryDto[],
    lastEntity?: AiLastRelevantEntity,
  ): boolean {
    if (lastEntity?.type === 'todo') return true;
    const lower = message.toLowerCase();
    if (
      /\b(vi[eệ]c|to.?do|task|c[aầ]n l[aà]m|ho[aà]n th[aà]nh|xong|deadline|h[aạ]n|danh s[aá]ch vi[eệ]c|\u0111[aá]nh d[aấ]u)\b/i.test(lower)
    ) {
      return true;
    }
    // Chỉ xét 6 turns gần nhất (RECENT_WINDOW)
    const recentHistory = history.slice(-6);
    return recentHistory.some((h) =>
      /todo_action|create_todos|vi[eệ]c c[aầ]n l[aà]m|\bt[aạ]o vi[eệ]c\b|\bxo[aá] vi[eệ]c\b|ho[aà]n th[aà]nh vi[eệ]c/i.test(
        h.content,
      ),
    );
  }

  /**
   * Kiểm tra xem request hiện tại có thực sự cần context notes không.
   *
   * - Nếu lastRelevantEntity là note → cần load.
   * - Nếu message chứa keyword liên quan note → load.
   * - Nếu 6 turns gần nhất của history nhắc tới note action → load.
   */
  private contextNeedsNotes(
    message: string,
    history: AiChatHistoryEntryDto[],
    lastEntity?: AiLastRelevantEntity,
  ): boolean {
    if (lastEntity?.type === 'note') return true;
    const lower = message.toLowerCase();
    if (
      /\b(ghi\s*ch[uú]|note|ghi l[aạ]i|\bnote\b)\b/i.test(lower)
    ) {
      return true;
    }
    // Chỉ xét 6 turns gần nhất (RECENT_WINDOW)
    const recentHistory = history.slice(-6);
    return recentHistory.some((h) =>
      /note_action|ghi ch[uú]|t[aạ]o ghi|xo[aá] ghi ch[uú]/i.test(h.content),
    );
  }

  /** Lấy (hoặc tạo) danh sách việc mặc định của người dùng — mirror
   *  `ensureDefaultTodoList()` phía frontend (`calendar-store.ts`), nhưng chạy
   *  server-side vì đây là một request AI-to-backend không qua client đó. */
  private async ensureDefaultTodoList(supabase: SupabaseClient, userId: string): Promise<string> {
    const lists = await this.todoListsService.findAllForUser(supabase);
    if (lists.length > 0) return lists[0].id;
    const created = await this.todoListsService.create(supabase, userId, { name: 'Việc cần làm' });
    return created.id;
  }

  /** Tạo/sửa/xoá/hoàn-thành MỘT việc cần làm cụ thể. */
  private async handleTodoAction(
    supabase: SupabaseClient,
    user: User,
    action: AiTodoActionIntent,
    todos: TodoDto[],
  ) {
    if (action.action === 'create') {
      if (!action.content) {
        return { intent: 'chat' as const, reply: 'Bạn muốn tạo việc gì? Nói rõ nội dung giúp mình nhé.' };
      }
      const listId = await this.ensureDefaultTodoList(supabase, user.id);
      const created = await this.todosService.create(supabase, user.id, {
        content: action.content,
        listId,
        ...(action.description ? { description: action.description } : {}),
        ...(action.due_at ? { dueAt: action.due_at } : {}),
      });
      return {
        intent: 'todo_action' as const,
        action: 'create' as const,
        todo: created,
        reply: `Đã thêm việc "${created.content}" vào việc cần làm.`,
      };
    }

    const target = matchByContent(todos, action.target_match, (t) => t.content);
    if (!target) {
      return {
        intent: 'chat' as const,
        reply: 'Mình chưa xác định được chính xác việc nào — bạn nói rõ tên việc giúp mình nhé.',
      };
    }

    if (action.action === 'delete') {
      await this.todosService.remove(supabase, target.id);
      return {
        intent: 'todo_action' as const,
        action: 'delete' as const,
        todoId: target.id,
        reply: `Đã xoá việc "${target.content}".`,
      };
    }
    if (action.action === 'complete') {
      const updated = await this.todosService.update(supabase, target.id, { done: true });
      return {
        intent: 'todo_action' as const,
        action: 'complete' as const,
        todo: updated,
        reply: `Đã đánh dấu "${target.content}" là hoàn thành.`,
      };
    }
    const updated = await this.todosService.update(supabase, target.id, {
      ...(action.content ? { content: action.content } : {}),
      ...(action.description !== undefined ? { description: action.description } : {}),
      ...(action.due_at ? { dueAt: action.due_at } : {}),
    });
    return {
      intent: 'todo_action' as const,
      action: 'update' as const,
      todo: updated,
      reply: `Đã cập nhật việc "${updated.content}".`,
    };
  }

  /** Tạo/sửa/xoá MỘT ghi chú. */
  private async handleNoteAction(
    supabase: SupabaseClient,
    user: User,
    action: AiNoteActionIntent,
    notes: NoteDto[],
  ) {
    if (action.action === 'create') {
      if (!action.content) {
        return { intent: 'chat' as const, reply: 'Bạn muốn ghi chú nội dung gì? Nói rõ giúp mình nhé.' };
      }
      const created = await this.notesService.create(supabase, user.id, {
        content: action.content,
        color: (action.color as CreateNoteDto['color']) ?? 'yellow',
      });
      return {
        intent: 'note_action' as const,
        action: 'create' as const,
        note: created,
        reply: 'Đã lưu ghi chú mới.',
      };
    }

    const target = matchByContent(notes, action.target_match, (n) => n.content);
    if (!target) {
      return {
        intent: 'chat' as const,
        reply: 'Mình chưa xác định được chính xác ghi chú nào — bạn mô tả rõ hơn giúp mình nhé.',
      };
    }

    if (action.action === 'delete') {
      await this.notesService.remove(supabase, target.id);
      return {
        intent: 'note_action' as const,
        action: 'delete' as const,
        noteId: target.id,
        reply: 'Đã xoá ghi chú.',
      };
    }
    const updated = await this.notesService.update(supabase, target.id, {
      ...(action.content ? { content: action.content } : {}),
      ...(action.color ? { color: action.color as CreateNoteDto['color'] } : {}),
    });
    return {
      intent: 'note_action' as const,
      action: 'update' as const,
      note: updated,
      reply: 'Đã cập nhật ghi chú.',
    };
  }

  /** Thao tác quản trị nhóm — kiểm tra thuộc nhóm nào, vai trò gì, có quyền
   *  hay không, rồi mới gọi vào GroupsService thật (tự kiểm tra lại quyền lần
   *  nữa — phòng thủ 2 lớp, không bao giờ bỏ qua service thật). */
  private async handleGroupAction(
    supabase: SupabaseClient,
    user: User,
    action: AiGroupActionIntent,
  ) {
    const groups = await this.groupsService.findAllForUser(supabase, user);
    if (groups.length === 0) {
      return { intent: 'chat' as const, reply: NO_GROUP_REPLY };
    }

    const group =
      (action.group_name
        ? groups.find((g) => g.name.toLowerCase().includes(action.group_name!.trim().toLowerCase()))
        : undefined) ?? (groups.length === 1 ? groups[0] : undefined);

    if (!group) {
      return {
        intent: 'chat' as const,
        reply: `Bạn đang ở các nhóm: ${groups.map((g) => g.name).join(', ')}. Bạn muốn thao tác ở nhóm nào?`,
      };
    }

    const actorRole = await this.groupsService.getViewerRole(supabase, group.id, user.id);
    if (!actorRole) {
      return { intent: 'chat' as const, reply: NO_GROUP_REPLY };
    }

    if (action.action === 'delete_group') {
      if (actorRole !== GroupRole.LEADER) {
        return { intent: 'chat' as const, reply: GROUP_PERMISSION_DENIED_REPLY };
      }
      await this.groupsService.deleteGroup(supabase, user, group.id);
      return { intent: 'chat' as const, reply: `Đã xoá nhóm "${group.name}".` };
    }

    if (action.action === 'add_member') {
      if (!canInvite(actorRole)) {
        return { intent: 'chat' as const, reply: GROUP_PERMISSION_DENIED_REPLY };
      }
      if (!action.member_email) {
        return {
          intent: 'chat' as const,
          reply: `Bạn muốn thêm ai vào nhóm "${group.name}"? Cho mình email của người đó nhé.`,
        };
      }
      await this.groupsService.inviteMember(supabase, user, group.id, {
        email: action.member_email,
        ...(action.member_role ? { role: action.member_role } : {}),
      });
      return {
        intent: 'chat' as const,
        reply: `Đã gửi lời mời tới ${action.member_email} vào nhóm "${group.name}".`,
      };
    }

    // remove_member
    if (!action.member_name_or_email) {
      return {
        intent: 'chat' as const,
        reply: `Bạn muốn xoá ai khỏi nhóm "${group.name}"? Cho mình biết tên hoặc email nhé.`,
      };
    }
    const members = await this.groupsService.getMembers(supabase, group.id);
    const needle = action.member_name_or_email.trim().toLowerCase();
    const targetMember =
      members.find((m) => m.email?.toLowerCase() === needle) ??
      matchByContent(members, action.member_name_or_email, (m) => m.name ?? m.email ?? '');
    if (!targetMember) {
      return {
        intent: 'chat' as const,
        reply: `Mình chưa xác định được ai trong nhóm "${group.name}" khớp với "${action.member_name_or_email}".`,
      };
    }
    if (targetMember.userId !== user.id) {
      const targetRole = await this.groupsService.getViewerRole(supabase, group.id, targetMember.userId);
      if (!targetRole || !canManage(actorRole, targetRole)) {
        return { intent: 'chat' as const, reply: GROUP_PERMISSION_DENIED_REPLY };
      }
    }
    await this.groupsService.removeMember(supabase, user, group.id, targetMember.userId);
    return {
      intent: 'chat' as const,
      reply: `Đã xoá ${targetMember.name ?? targetMember.email ?? 'thành viên'} khỏi nhóm "${group.name}".`,
    };
  }

  /**
   * Đọc một file (.ics/.csv/.pdf/.docx/.xlsx) và đề xuất sự kiện + việc cần làm.
   *
   * CỐ Ý KHÔNG lưu bất cứ thứ gì: kết quả chỉ để dựng bảng xem trước trong
   * khung chat. Người dùng chọn xong mới gọi các endpoint tạo sẵn có.
   */
  @Post('analyze-file')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MULTER_FILE_SIZE_LIMIT, files: 1 },
      fileFilter: (_req, file, callback) => {
        if (!hasAllowedExtension(file.originalname, ALLOWED_AI_FILE_EXTENSIONS)) {
          callback(
            new BadRequestException(
              `Chỉ hỗ trợ file ${AI_FILE_FORMATS_LABEL}.`,
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  // Đọc file tốn tài nguyên hơn chat thường nên hạn mức chặt hơn.
  @Throttle({ default: HEAVY_OPERATION_RATE_LIMIT })
  async analyzeFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('message') message = '',
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng đính kèm một file.');
    }

    if (!hasAllowedExtension(file.originalname, ALLOWED_AI_FILE_EXTENSIONS)) {
      throw new BadRequestException(`Chỉ hỗ trợ file ${AI_FILE_FORMATS_LABEL}.`);
    }

    const text = await this.fileImport.extractTextFromFile(file);
    if (!text.trim()) {
      throw new BadRequestException('File không có nội dung văn bản nào để đọc.');
    }

    try {
      const analysis = await this.aiService.analyzeFile(text, file.originalname, message ?? '');
      return { ...analysis, fileName: file.originalname };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
