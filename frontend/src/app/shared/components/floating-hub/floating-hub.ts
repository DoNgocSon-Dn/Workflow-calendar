import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { OverflowTooltip } from '../../directives/overflow-tooltip';
import { CharCounter } from '../char-counter/char-counter';
import { AuthStore } from '../../../core/auth/auth-store';
import { TranslationService } from '../../../core/i18n/translation.service';
import { NotificationQueue } from '../../../core/realtime/notification-queue';
import { NotificationSoundService } from '../../../core/services/notification-sound.service';
import {
  AiChatHistoryEntry,
  AiLastRelevantEntity,
  AiFileAnalysis,
  AiFileEvent,
  AiSuggestedTodo,
  CalendarStore,
} from '../../../features/calendar/data/calendar-store';
import {
  fromDateInputValue,
  parseTime24,
  toDateInputValue,
} from '../../../features/calendar/utils/date-utils';
import {
  hasMeaningfulText,
  pickSingleFile,
  signalsFiles,
  skippedFilesMessage,
} from '../../utils/clipboard-files';

/** Số lượt chat gần nhất gửi kèm lên backend làm ngữ cảnh — đủ để AI hiểu các
 *  câu hỏi tiếp nối ("còn ngày mai thì sao?") mà không làm phình prompt. */
const CHAT_HISTORY_TURNS = 10;

/**
 * One draggable floating bubble that combines the personal-notes widget and
 * the AI assistant widget — previously two separate FABs — behind a single
 * button with a tab switcher, movable anywhere on screen like a chat head.
 */

/** Một gợi ý nhanh trong màn hình chào của AI — `icon` chỉ để chọn SVG hiển
 *  thị trong template, không ảnh hưởng gì tới nội dung gửi đi. */
interface AiSuggestion {
  readonly text: string;
  readonly icon: 'meeting' | 'time' | 'goal' | 'split';
}

/** Sự kiện AI vừa tạo, đã tách sẵn từng trường để template dựng thành thẻ. */
interface ChatEventCard {
  readonly title: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly location?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestManualForm?: boolean;
  guessedTitle?: string;
  /** Tên file người dùng đã gửi kèm câu này, hiện lại trong lịch sử chat. */
  attachmentName?: string;
  /** Có giá trị thì tin nhắn dựng thành THẺ sự kiện thay cho đoạn chữ thường. */
  event?: ChatEventCard;
}

/**
 * Một dòng trong bảng xem trước việc cần làm do AI đề xuất.
 *
 * Đây là bản nháp SỐNG trong bộ nhớ, chưa hề chạm tới danh sách thật: người
 * dùng bỏ chọn, sửa tên, đổi ngày thoải mái rồi mới bấm thêm.
 */
interface TodoDraftRow {
  readonly id: string;
  content: string;
  readonly description?: string;
  /** Chuỗi 'YYYY-MM-DD' cho <input type="date">, rỗng nghĩa là không có hạn. */
  dueDate: string;
  selected: boolean;
  /** Đã có một việc chưa xong trùng tên trong danh sách hiện tại. */
  readonly duplicate: boolean;
}

interface TodoProposal {
  readonly goal: string;
  readonly rows: readonly TodoDraftRow[];
}

/** Giờ mặc định khi người dùng tự chọn NGÀY nhưng ô ngày không có giờ. Đây là
 *  hệ quả của việc dùng <input type="date">, không phải AI bịa thời gian. */
const TODO_DEFAULT_TIME = '09:00';

/** Bỏ dấu, gộp khoảng trắng, hạ chữ thường — để "Viết mở bài" và "viết  mở
 *  bài" được coi là một việc khi dò trùng. */
function normalizeTodoContent(content: string): string {
  return content
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Khớp ALLOWED_AI_FILE_EXTENSIONS ở backend (backend/src/common/limits.ts).
 *
 * .ics và .csv trùng với chức năng Import Lịch là CỐ Ý — Import đọc theo đúng
 * chuẩn, còn Trợ lý AI hiểu được file trình bày tự do. Định dạng Office
 * (.xlsx/.docx) không còn được nhận.
 */
const ACCEPTED_FILE_EXT = ['.ics', '.csv', '.pdf'] as const;
const ACCEPT_ATTR = ACCEPTED_FILE_EXT.join(',');

/** Khớp giới hạn phía backend để báo lỗi ngay, khỏi tải lên rồi mới bị từ chối. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Một dòng sự kiện trong bảng xem trước.
 *
 * `startLocal` rỗng nghĩa là file không cho biết ngày giờ. Dòng đó vẫn hiện
 * đầy đủ kèm lời giải thích, người dùng tự điền — KHÔNG đắp sẵn một mốc bịa.
 */
interface EventDraftRow {
  readonly id: string;
  title: string;
  startLocal: string;
  endLocal: string;
  readonly allDay: boolean;
  location: string;
  readonly description?: string;
  readonly missing?: string;
  selected: boolean;
}

interface EventProposal {
  readonly fileName: string;
  readonly rows: readonly EventDraftRow[];
}

/** Date -> chuỗi cho <input type="datetime-local"> (giờ địa phương). */
function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes())
  );
}

const POS_STORAGE_KEY = 'floating-hub-pos';
const FAB_SIZE = 52;
const EDGE_MARGIN = 24;
/** Thời lượng một lượt sóng, phải khớp keyframe rippleSpread trong CSS. */
const RIPPLE_MS = 900;

const PANEL_GAP = 12;
const DRAG_THRESHOLD_PX = 4;

interface HubPos {
  readonly x: number;
  readonly y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultPos(): HubPos {
  return {
    x: window.innerWidth - FAB_SIZE - EDGE_MARGIN,
    y: window.innerHeight - FAB_SIZE - EDGE_MARGIN,
  };
}

function readStoredPos(): HubPos {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HubPos>;
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return {
          x: clamp(parsed.x, EDGE_MARGIN / 4, window.innerWidth - FAB_SIZE - EDGE_MARGIN / 4),
          y: clamp(parsed.y, EDGE_MARGIN / 4, window.innerHeight - FAB_SIZE - EDGE_MARGIN / 4),
        };
      }
    }
  } catch {
    // Ignore malformed/unavailable storage — fall back to the default corner.
  }
  return defaultPos();
}

function extractErrorMessage(
  err: unknown,
  t: (key: string) => string,
): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return t('hub.errNetwork');
    }
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
      if (
        raw.includes('<!DOCTYPE') ||
        raw.includes('<html') ||
        raw.includes('522') ||
        raw.includes('Cloudflare') ||
        raw.includes('Connection timed out')
      ) {
        return 'Máy chủ cơ sở dữ liệu (Supabase) đang tạm thời mất kết nối (522 Connection Timeout). Vui lòng thử lại sau giây lát.';
      }
      return raw;
    }
  }
  return t('hub.errGeneric');
}

function isDeleteIntent(text: string): boolean {
  return /\b(xóa|xoá|hủy|huỷ)\b/i.test(text);
}

/** Dấu hiệu người dùng đang nêu một MỤC TIÊU cần chia nhỏ, chứ không phải một
 *  cuộc hẹn tại một thời điểm. */
function isPlanIntent(text: string): boolean {
  return /(k[eế] ho[aạ]ch|l[eê]n k[eế]|chia nh[oỏ]|danh s[aá]ch vi[eệ]c|vi[eệ]c c[aầ]n l[aà]m|to.?do|c[aá]c b[uư][oớ]c|chu[aẩ]n b[iị]|[oô]n (thi|t[aậ]p))/i.test(
    text,
  );
}

/**
 * Câu người dùng vừa gõ có đang nói về FILE đính kèm hay không.
 *
 * Đính kèm một file không có nghĩa là muốn đọc nó ngay. Người dùng hoàn toàn
 * có thể kẹp sẵn file rồi hỏi một việc khác ("sắp xếp lịch mai đi học từ 9h
 * đến 17h") — lúc đó đem file đi trích xuất là làm sai việc, và nếu file lỗi
 * thì còn nuốt mất luôn yêu cầu thật của họ.
 *
 * Chỉ nhận diện những từ CHỈ ĐÍCH DANH tài liệu. Động từ chung như "phân
 * tích" hay "đọc" đứng một mình thì bỏ qua, vì chúng xuất hiện tự nhiên
 * trong tên sự kiện ("họp phân tích dữ liệu").
 */
/** Danh từ có thể đang trỏ vào tài liệu vừa đính kèm. CỐ Ý không có danh từ
 *  chỉ thời gian ("tuần", "tháng", "sáng") — "tuần này" là mốc thời gian, không
 *  phải cái file. */
const FILE_SUBJECT =
  'file|t[eệ]p|t[aà]i li[eệ]u|b[aả]ng( t[ií]nh| bi[eể]u)?|danh s[aá]ch|n[oộ]i dung|' +
  'd[uữ] li[eệ]u|th[oô]ng tin|l[iị]ch( h[oọ]c| thi| bi[eể]u)?|c[aá]i';

/** Tên gọi của chính tài liệu — đứng một mình đã đủ rõ, không cần "này". */
const FILE_NOUN =
  'file|t[eệ]p|t[aà]i li[eệ]u|[dđ][ií]nh k[eè]m|pdf|' +
  '\\bics\\b|\\bcsv\\b|' +
  'th[oờ]i kh[oó]a bi[eể]u|th[oờ]i kho[aá] bi[eể]u|tkb';


/**
 * Câu đã tự nêu một mốc thời gian cụ thể hay chưa.
 *
 * CỐ Ý không tính "tuần này"/"tháng này": đó là khoảng mơ hồ, không ghim được
 * một buổi nào — "tạo lịch tuần này" kèm file vẫn là bảo đọc file.
 */
function hasConcreteTime(text: string): boolean {
  return (
    // 9h, 9 giờ, 19:30
    /\d{1,2}\s*(h\b|gi[oờ]|:\d{2})/i.test(text) ||
    // 12/10, 12-10
    /\d{1,2}\s*[/-]\s*\d{1,2}/.test(text) ||
    /(h[oô]m nay|h[oô]m qua|ng[aà]y mai|ng[aà]y m[oố]t|s[aá]ng mai|t[oố]i nay|chi[eề]u nay)/i.test(text) ||
    /\b(mai|m[oố]t)\b/i.test(text) ||
    /th[uứ]\s*[2-7]|ch[uủ] nh[aậ]t/i.test(text) ||
    // "trong 7 ngày", "2 tuần nữa"
    /\d+\s*(ng[aà]y|tu[aầ]n|th[aá]ng|ti[eế]ng|ph[uú]t|gi[oờ])/i.test(text)
  );
}

const CREATE_VERB =
  't[aạ]o|th[eê]m|l[eê]n|x[eế]p|s[aắ]p x[eế]p|nh[aậ]p|import|[dđ][uư]a v[aà]o|cho v[aà]o|l[aậ]p|d[uự]ng';

const CALENDAR_NOUN =
  'l[iị]ch|s[uự] ki[eệ]n|calendar|th[oờ]i kh[oó]a bi[eể]u|th[oờ]i kho[aá] bi[eể]u|tkb|' +
  'vi[eệ]c c[aầ]n l[aà]m|to.?do|nhi[eệ]m v[uụ]|deadline';

/**
 * Người dùng bảo dựng lịch/việc nhưng KHÔNG nêu mốc thời gian nào.
 *
 * Kèm file mà nói "tạo cho tôi cái lịch" thì dữ liệu chỉ có thể nằm trong
 * file — đó chính là lý do người ta đính kèm nó. Không đọc file lúc này là
 * bắt người dùng phải nói thêm một câu thừa.
 *
 * Ngược lại "Họp team 9h sáng mai" đã tự đủ dữ kiện: đem file đi đọc lúc đó
 * là làm sai việc, và yêu cầu thật của họ bị nuốt mất.
 */
function wantsCalendarFromFile(text: string): boolean {
  const asksToBuild = new RegExp(
    `(${CREATE_VERB}).{0,20}(${CALENDAR_NOUN})`,
    'i',
  ).test(text);
  return asksToBuild && !hasConcreteTime(text);
}

function mentionsAttachedFile(text: string): boolean {
  // Hàm này CHỈ được gọi khi đã có file đính kèm, nên "lịch học này" không thể
  // trỏ vào thứ gì khác ngoài tài liệu đó.
  const demonstrative = new RegExp(`(${FILE_SUBJECT})\\s*(n[aà]y|[đd][oó]|tr[eê]n)`, 'i');
  const named = new RegExp(`(${FILE_NOUN})`, 'i');
  return (
    named.test(text) ||
    demonstrative.test(text) ||
    /(tr[ií]ch xu[aấ]t|[dđ][oọ]c (c[aá]i )?(n[aà]y|gi[uú]p))/i.test(text)
  );
}

type T = (key: string, vars?: Record<string, string | number>) => string;

function formatDateLabel(date: Date, t: T): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  const absolute = new Intl.DateTimeFormat(t('common.dateLocale'), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  if (diffDays === 0) return t('hub.dateToday', { date: absolute });
  if (diffDays === 1) return t('hub.dateTomorrow', { date: absolute });
  return absolute;
}

/**
 * Sự kiện vừa tạo, tách thành từng trường rời.
 *
 * Bản trước nối tất cả thành MỘT chuỗi và dùng emoji làm nhãn ("📅 Ngày: …").
 * Ba vấn đề: emoji không đổi màu theo giao diện sáng/tối, không co giãn theo
 * cỡ chữ, và trình đọc màn hình đọc luôn tên emoji giữa câu. Trả về dữ liệu
 * rồi để template lo phần nhìn thì cả ba biến mất, và tiêu đề sự kiện được
 * nhấn mạnh đúng mức thay vì nằm lẫn trong một khối chữ đều tăm tắp.
 */
function buildEventCard(
  event: {
    title: string;
    start: string;
    end: string;
    location?: string;
  },
  t: T,
): ChatEventCard {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const invalid = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime());
  const timeFmt = new Intl.DateTimeFormat(t('common.dateLocale'), { hour: '2-digit', minute: '2-digit' });

  return {
    title: event.title,
    dateLabel: invalid ? event.start : formatDateLabel(start, t),
    timeLabel: invalid
      ? `${event.start} – ${event.end}`
      : `${timeFmt.format(start)} – ${timeFmt.format(end)}`,
    location: event.location || undefined,
  };
}

/**
 * Câu xác nhận khi AI tạo một lịch LẶP LẠI theo nhiều thứ trong tuần (vd
 * "lịch 246", "T3 T5 T7") — thay cho thẻ sự kiện đơn (buildEventCard) vốn chỉ
 * hiển thị được đúng MỘT lần xuất hiện.
 *
 * Đọc thẳng thứ trong tuần từ NGÀY THỰC TẾ của các sự kiện đã tạo (không phải
 * từ recurrence rule gửi kèm) — đây là những gì đã thật sự được ghi vào lịch,
 * nên không thể lệch với những gì người dùng sắp thấy trên lưới lịch.
 */
function buildRecurringConfirmation(events: readonly { start: string }[], t: T): string {
  const weekdays = [...new Set(events.map((e) => new Date(e.start).getDay()))].sort(
    (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
  );
  const weekdayFmt = new Intl.DateTimeFormat(t('common.dateLocale'), { weekday: 'long' });
  // 2024-01-07 là Chủ nhật — mốc tham chiếu bất kỳ, chỉ cần đúng thứ.
  const names = weekdays
    .map((wd) => {
      const label = weekdayFmt.format(new Date(2024, 0, 7 + wd));
      return label.charAt(0).toUpperCase() + label.slice(1);
    })
    .join(', ');
  return t('hub.recurringCreated', { count: events.length, days: names });
}

@Component({
  selector: 'app-floating-hub',
  templateUrl: './floating-hub.html',
  styleUrl: './floating-hub.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, OverflowTooltip, CharCounter],
})
export class FloatingHub {
  private readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);
  private readonly t: T = (key, vars) => this.i18n.t(key, vars);
  private readonly notificationQueue = inject(NotificationQueue);
  private readonly notificationSound = inject(NotificationSoundService);

  protected readonly fabSize = FAB_SIZE;
  protected readonly panelGap = PANEL_GAP;

  readonly openManualForm = output<string>();

  // --- Bubble open state + drag-anywhere position ------------------------
  protected readonly open = signal(false);
  protected readonly pos = signal<HubPos>(readStoredPos());
  protected readonly dragging = signal(false);
  protected readonly lastCreatedEventId = signal<string | null>(null);
  /** Entity gần nhất AI vừa thao tác thành công — giữ qua giữa các turn
   *  để gửi kèm mỗi request, giúp backend resolve tham chiếu "nó"/"cái đó". */
  protected readonly lastRelevantEntity = signal<AiLastRelevantEntity | null>(null);

  private dragStart: { pointerX: number; pointerY: number; fabX: number; fabY: number } | null = null;
  private movedDuringDrag = false;

  /** Which side of the bubble the panel should open on, so it always stays
   *  fully on-screen no matter where the bubble was dragged to. */
  protected readonly panelSide = computed(() => {
    const p = this.pos();
    const horizontal: 'left' | 'right' = p.x + FAB_SIZE / 2 > window.innerWidth / 2 ? 'left' : 'right';
    const vertical: 'up' | 'down' = p.y + FAB_SIZE / 2 > window.innerHeight / 2 ? 'up' : 'down';
    return { horizontal, vertical };
  });

  /**
   * Gốc của hiệu ứng lan sóng, đặt ở GÓC PANEL GIÁP BONG BÓNG.
   *
   * Panel neo quanh bong bóng và bong bóng kéo được khắp màn hình, nên toạ độ
   * click tuyệt đối không dùng được — nhưng `panelSide()` đã cho biết panel
   * mở về hướng nào, đủ để sóng luôn xuất phát từ phía người dùng vừa bấm.
   */
  /** Ripple chỉ tồn tại trong đúng một lượt mở. Gỡ hẳn khỏi DOM sau đó —
   *  để lại phần tử với opacity 0 vẫn là một lớp phủ nằm trên nội dung, và
   *  vẫn có nguy cơ chạy lại khi Angular vẽ lại panel. */
  protected readonly rippleActive = signal(false);
  private rippleTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly rippleX = computed(() =>
    this.panelSide().horizontal === 'right' ? '0%' : '100%',
  );
  protected readonly rippleY = computed(() =>
    this.panelSide().vertical === 'down' ? '0%' : '100%',
  );

  /** Dạng ghép cho clip-path / transform-origin (cần "x y" trên một dòng). */
  protected readonly rippleOrigin = computed(() => `${this.rippleX()} ${this.rippleY()}`);

  protected panelLeft(): number | null {
    return this.panelSide().horizontal === 'right' ? this.pos().x + FAB_SIZE + PANEL_GAP : null;
  }

  protected panelRight(): number | null {
    return this.panelSide().horizontal === 'left' ? window.innerWidth - this.pos().x + PANEL_GAP : null;
  }

  protected panelTop(): number | null {
    return this.panelSide().vertical === 'down' ? this.pos().y + FAB_SIZE + PANEL_GAP : null;
  }

  protected panelBottom(): number | null {
    return this.panelSide().vertical === 'up' ? window.innerHeight - this.pos().y + PANEL_GAP : null;
  }

  onFabPointerDown(event: PointerEvent): void {
    this.movedDuringDrag = false;
    const current = this.pos();
    this.dragStart = { pointerX: event.clientX, pointerY: event.clientY, fabX: current.x, fabY: current.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onFabPointerMove(event: PointerEvent): void {
    const start = this.dragStart;
    if (!start) return;
    const dx = event.clientX - start.pointerX;
    const dy = event.clientY - start.pointerY;
    if (!this.movedDuringDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    this.movedDuringDrag = true;
    this.dragging.set(true);
    this.pos.set({
      x: clamp(start.fabX + dx, 4, window.innerWidth - FAB_SIZE - 4),
      y: clamp(start.fabY + dy, 4, window.innerHeight - FAB_SIZE - 4),
    });
  }

  onFabPointerUp(): void {
    if (!this.dragStart) return;
    this.dragStart = null;
    this.dragging.set(false);
    if (this.movedDuringDrag) {
      try {
        localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(this.pos()));
      } catch {
        // Ignore write failures (private browsing quota, etc.).
      }
    } else {
      this.toggle();
    }
  }

  toggle(): void {
    const willOpen = !this.open();
    this.open.update((v) => !v);

    if (willOpen) {
      if (this.rippleTimer) clearTimeout(this.rippleTimer);
      this.rippleActive.set(true);
      // Khớp thời lượng animation trong CSS; hết là gỡ luôn.
      this.rippleTimer = setTimeout(() => this.rippleActive.set(false), RIPPLE_MS);
    }
  }

  constructor() {
    // Huỷ component giữa lúc đang chờ AI thì finally chưa chạy — timer sẽ
    // tiếp tục tick vào một signal của component đã chết.
    this.hubDestroyRef.onDestroy(() => {
      this.stopThinking();
      if (this.rippleTimer) clearTimeout(this.rippleTimer);
    });
  }

  // --- AI chat (giao diện duy nhất còn lại trong bubble) ------------------

  /**
   * Câu trạng thái hiển thị trong lúc chờ AI trả lời.
   *
   * QUAN TRỌNG: backend chỉ có MỘT lời gọi duy nhất, không chia bước. Nên các
   * câu này cố tình nói chung chung về việc "đang xử lý", KHÔNG mô tả những
   * bước backend không hề thực hiện. Nói "đang kiểm tra lịch trống" trong khi
   * server không làm việc đó là nói dối người dùng.
   */
  /** i18n keys per thinking phase — resolved in `thinkingLine()` so the lines
   *  follow the current language. */
  private static readonly THINKING_KEYS: Readonly<
    Record<'create' | 'delete' | 'plan' | 'file' | 'generic', readonly string[]>
  > = {
    create: ['hub.think.create1', 'hub.think.create2', 'hub.think.reply'],
    delete: ['hub.think.delete1', 'hub.think.reply'],
    plan: ['hub.think.plan1', 'hub.think.plan2', 'hub.think.plan3'],
    file: ['hub.think.file1', 'hub.think.file2', 'hub.think.file3', 'hub.think.plan3'],
    generic: ['hub.think.generic1', 'hub.think.generic2', 'hub.think.reply'],
  };

  /** Đổi câu sau mỗi nhịp này. Đủ chậm để đọc kịp, đủ nhanh để không thấy đứng. */
  private static readonly THINKING_STEP_MS = 1400;

  private readonly thinkingKind = signal<'create' | 'delete' | 'plan' | 'file' | 'generic'>('generic');
  private readonly thinkingStep = signal(0);
  private thinkingTimer: ReturnType<typeof setInterval> | null = null;

  private readonly hubDestroyRef = inject(DestroyRef);

  /** Câu đang hiển thị; dừng lại ở câu cuối thay vì quay vòng, vì quay vòng
   *  làm người dùng tưởng nó bị kẹt. */
  protected readonly thinkingLine = computed(() => {
    const keys = FloatingHub.THINKING_KEYS[this.thinkingKind()];
    return this.i18n.t(keys[Math.min(this.thinkingStep(), keys.length - 1)]);
  });
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly aiError = signal<string | null>(null);

  /** Icon riêng cho từng gợi ý — template switch sang đúng SVG tương ứng.
   *  `sendSuggestion()` vẫn chỉ nhận text như cũ, hành vi click không đổi. */
  private static readonly SUGGESTION_KEYS: readonly AiSuggestion['icon'][] = [
    'meeting',
    'time',
    'goal',
    'split',
  ];
  readonly suggestions = computed<readonly AiSuggestion[]>(() =>
    FloatingHub.SUGGESTION_KEYS.map((icon, i) => ({
      icon,
      text: this.i18n.t(`hub.suggest${i + 1}`),
    })),
  );

  async send(): Promise<void> {
    const text = this.draft().trim();
    const file = this.pendingFile();
    // Chỉ đính kèm file mà không gõ gì cũng là một yêu cầu hợp lệ.
    if ((!text && !file) || this.sending()) return;

    // Đọc file khi: không gõ gì (đính kèm chính là yêu cầu), hoặc câu có nhắc
    // tới tài liệu, hoặc câu bảo dựng lịch mà không kèm mốc thời gian nào —
    // lúc đó dữ liệu chỉ có thể nằm trong file.
    if (file && (!text || mentionsAttachedFile(text) || wantsCalendarFromFile(text))) {
      await this.handleFileSend(file, text);
      return;
    }

    const calendarId = this.store.defaultWritableCalendar()?.id;
    if (!calendarId) {
      this.aiError.set(this.i18n.t('hub.errNoCalendar'));
      return;
    }

    // Chụp lại lịch sử TRƯỚC khi thêm tin nhắn user hiện tại — tránh gửi trùng
    // câu vừa hỏi trong cả `message` lẫn `history`.
    const history: AiChatHistoryEntry[] = this.messages()
      .slice(-CHAT_HISTORY_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.text }));

    // Bảng đề xuất trước đó thuộc về câu hỏi cũ; giữ lại sẽ khiến người dùng
    // bấm "thêm" cho một danh sách không còn liên quan.
    this.todoProposal.set(null);
    this.proposalError.set(null);
    this.eventProposal.set(null);
    this.eventProposalError.set(null);

    // File (nếu có) CỐ Ý được giữ nguyên trong ô đính kèm: câu này không nói
    // gì về nó nên chưa dùng tới, nhưng vứt đi thì người dùng phải chọn lại từ
    // đầu. Đính kèm vẫn nằm đó để câu sau chỉ cần bảo "đọc file này".
    this.pushMessage('user', text);
    this.draft.set('');
    this.sending.set(true);
    this.aiError.set(null);
    this.startThinking(text);

    try {
      const result = await this.store.sendAiChat(text, calendarId, history, this.lastRelevantEntity() ?? undefined);
      if (result.intent === 'create_event') {
        if (result.event?.id) this.lastCreatedEventId.set(result.event.id);
        const createdCount = result.events?.length ?? 1;
        // events có từ 2 phần tử trở lên = một lịch LẶP LẠI theo nhiều thứ
        // trong tuần (vd "lịch 246") — báo rõ số lượng và các thứ đã tạo,
        // thay vì dựng thẻ cho MỘT sự kiện rồi im lặng bỏ qua các lần lặp còn
        // lại (người dùng sẽ tưởng chỉ có một buổi được tạo).
        if (createdCount > 1) {
          this.pushMessage('assistant', buildRecurringConfirmation(result.events!, this.t));
        } else {
          this.pushEventMessage(this.i18n.t('hub.addedToCalendar'), buildEventCard(result.event, this.t));
        }
        // Cập nhật entity gần nhất để turn sau có thể resolve "nó"/"cái đó"
        const primaryEvent = result.events?.[0] ?? result.event;
        this.lastRelevantEntity.set({
          type: 'event',
          title: primaryEvent.title,
          start: primaryEvent.start,
          end: primaryEvent.end,
          source: 'recently_created',
        });
        // Toast + âm thanh xác nhận: MỘT bộ duy nhất cho CẢ YÊU CẦU, dù AI vừa
        // tạo 1 sự kiện hay cả một chuỗi lặp lại N sự kiện — gọi đúng MỘT lần
        // ở đây (không lặp qua từng event) nên không có nguy cơ ra N toast
        // hay N tiếng kêu cho một request. Đây là lệnh gọi mệnh lệnh bên
        // trong send(), chạy đúng một lần ngay khi request thành công — không
        // phải effect() theo dõi state — nên reload trang hay Angular render
        // lại UI không thể kích hoạt lại nó.
        this.notificationQueue.push({
          kind: 'success',
          title: createdCount > 1 ? this.i18n.t('hub.toastScheduleCreated') : this.i18n.t('hub.toastEventCreated'),
          body:
            createdCount > 1
              ? this.i18n.t('hub.toastEventsAdded', { count: createdCount })
              : this.i18n.t('hub.toastEventSaved', { title: result.event.title }),
        });
        const titleLower = (result.event.title || '').toLowerCase();
        if (titleLower.includes('sinh nhật') || titleLower.includes('birthday') || titleLower.includes('sinh nhat')) {
          this.notificationSound.notifyKind('birthday');
        } else if (
          titleLower.includes('quan trọng') ||
          titleLower.includes('gấp') ||
          titleLower.includes('khẩn cấp') ||
          titleLower.includes('họp') ||
          titleLower.includes('deadline') ||
          titleLower.includes('ngày lễ') ||
          titleLower.includes('sự kiện')
        ) {
          this.notificationSound.notifyKind('important');
        } else {
          this.notificationSound.notifyKind('default');
        }
      } else if (result.intent === 'create_todos') {
        const proposal = this.buildProposal(result.goal, result.todos);
        if (proposal.rows.length) {
          this.todoProposal.set(proposal);
          this.proposalError.set(null);
          this.pushMessage('assistant', this.i18n.t('hub.msgTodosSplit'));
        } else {
          this.pushMessage('assistant', this.i18n.t('hub.msgNoTodos'));
        }
      } else if (
        result.intent === 'chat' ||
        result.intent === 'event_action' ||
        result.intent === 'todo_action' ||
        result.intent === 'note_action'
      ) {
        // event_action/todo_action/note_action đã được CalendarStore.sendAiChat()
        // áp thẳng vào signal tương ứng (events/todos/notes) rồi — ở đây chỉ cần
        // báo lại cho người dùng biết đã làm gì.
        this.pushMessage('assistant', result.reply);
        // Cập nhật entity gần nhất khi action thành công
        if (result.intent === 'event_action') {
          if (result.action === 'update') {
            this.lastRelevantEntity.set({
              type: 'event',
              title: result.event.title,
              start: result.event.start,
              end: result.event.end,
              source: 'recently_updated',
            });
          } else {
            // delete: xoá entity sau khi xác nhận done
            this.lastRelevantEntity.set(null);
          }
        } else if (result.intent === 'todo_action') {
          if (result.action !== 'delete') {
            this.lastRelevantEntity.set({
              type: 'todo',
              title: result.todo.content,
              source:
                result.action === 'create' ? 'recently_created' : 'recently_updated',
            });
          } else {
            this.lastRelevantEntity.set(null);
          }
        } else if (result.intent === 'note_action') {
          if (result.action !== 'delete') {
            this.lastRelevantEntity.set({
              type: 'note',
              title: result.note.content,
              source:
                result.action === 'create' ? 'recently_created' : 'recently_updated',
            });
          } else {
            this.lastRelevantEntity.set(null);
          }
        }
      } else {
        // Thiếu ngày là tình huống RIÊNG: mọi thứ khác đã hiểu rồi, chỉ cần
        // người dùng nói một chữ "ngày mai" là xong. Đẩy họ sang form nhập
        // tay lúc này là bắt gõ lại toàn bộ thứ vừa nói.
        const missing = result.missingFields ?? [];
        if (missing.includes('date') && !missing.includes('title')) {
          const what = result.title ? `"${result.title}"` : this.i18n.t('hub.thisItem');
          const when = result.startTime
            ? ` (${result.startTime}${result.endTime ? ' – ' + result.endTime : ''})`
            : '';
          this.pushMessage('assistant', this.i18n.t('hub.msgMissingDate', { what, when }));
        } else if (missing.includes('time') && !missing.includes('date') && !missing.includes('title')) {
          // Thiếu GIỜ là tình huống RIÊNG với "thiếu ngày" ở trên, không phải
          // cùng một nhánh "chưa chắc chắn chung chung": ngày/thứ trong tuần
          // (kể cả một lịch LẶP LẠI đã có đủ khoảng ngày bắt đầu/kết thúc, vd
          // "357 từ 13/07 tới 29/08") đã hiểu xong, chỉ còn thiếu khung giờ.
          // Hỏi lại ngày ở đây sẽ bắt người dùng gõ lại thứ/khoảng ngày vừa
          // nói — đúng điều yêu cầu này cấm.
          const what = result.title
            ? this.i18n.t('hub.scheduleNamed', { name: result.title.toLowerCase() })
            : this.i18n.t('hub.scheduleThis');
          this.pushMessage('assistant', this.i18n.t('hub.msgMissingTime', { what }));
        } else {
          this.pushMessage('assistant', this.i18n.t('hub.msgUnsureTime'), true, result.title);
        }
      }
    } catch (err) {
      this.aiError.set(extractErrorMessage(err, (k) => this.i18n.t(k)));
    } finally {
      this.stopThinking();
      this.sending.set(false);
      // Không im lặng bỏ qua file: nói rõ là chưa đụng tới nó.
      if (file) {
        this.pushMessage('assistant', this.i18n.t('hub.msgFileUntouched', { name: file.name }));
      }
    }
  }

  /**
   * Gửi file cho AI đọc.
   *
   * Tách khỏi send() vì luồng khác hẳn: không có lịch sử hội thoại, không
   * phân tích ý định, và kết quả luôn là bảng xem trước chứ không phải một
   * câu trả lời.
   */
  private async handleFileSend(file: File, text: string): Promise<void> {
    this.todoProposal.set(null);
    this.proposalError.set(null);
    this.eventProposal.set(null);
    this.eventProposalError.set(null);

    this.pushMessage('user', text || this.i18n.t('hub.readThisFile'), undefined, undefined, file.name);
    this.draft.set('');
    this.cancelChipExit();
    this.pendingFile.set(null);
    this.sending.set(true);
    this.aiError.set(null);
    this.thinkingKind.set('file');
    this.thinkingStep.set(0);
    this.thinkingTimer = setInterval(() => {
      this.thinkingStep.update((n) => n + 1);
    }, FloatingHub.THINKING_STEP_MS);

    try {
      const analysis = await this.store.analyzeAiFile(file, text);
      this.applyFileAnalysis(analysis);
    } catch (err) {
      this.aiError.set(extractErrorMessage(err, (k) => this.i18n.t(k)));
    } finally {
      this.stopThinking();
      this.sending.set(false);
    }
  }

  /** Chọn nhóm câu theo ý định ĐÃ nhận diện được bằng chính hàm có sẵn, không
   *  đoán thêm gì mới. */
  private startThinking(text: string): void {
    // Chỉ đoán để chọn CÂU CHỜ cho bớt lệch; ý định thật do backend quyết.
    if (isDeleteIntent(text)) this.thinkingKind.set('delete');
    else if (isPlanIntent(text)) this.thinkingKind.set('plan');
    else this.thinkingKind.set('create');
    this.thinkingStep.set(0);
    this.thinkingTimer = setInterval(() => {
      this.thinkingStep.update((n) => n + 1);
    }, FloatingHub.THINKING_STEP_MS);
  }

  private stopThinking(): void {
    if (this.thinkingTimer) clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
  }

  private async handleDeleteIntent(): Promise<void> {
    const id = this.lastCreatedEventId();
    if (!id) {
      this.pushMessage('assistant', this.i18n.t('hub.msgNothingToDelete'));
      return;
    }
    await this.store.deleteEvent(id);
    this.lastCreatedEventId.set(null);
    this.pushMessage('assistant', this.i18n.t('hub.msgEventDeleted'));
  }
  sendSuggestion(suggestion: string): void {
    this.draft.set(suggestion);
    this.send();
  }

  // --- Việc cần làm do AI đề xuất (bảng xem trước, CHƯA lưu) -------------

  /**
   * Danh sách đang chờ người dùng duyệt. Chừng nào signal này còn khác null
   * thì chưa có gì được ghi vào "Việc cần làm" — mọi thao tác thêm đều đi qua
   * confirmTodoProposal().
   */
  protected readonly todoProposal = signal<TodoProposal | null>(null);
  protected readonly savingProposal = signal(false);
  protected readonly proposalError = signal<string | null>(null);

  protected readonly selectedProposalCount = computed(
    () => this.todoProposal()?.rows.filter((r) => r.selected).length ?? 0,
  );

  protected readonly duplicateProposalCount = computed(
    () => this.todoProposal()?.rows.filter((r) => r.duplicate).length ?? 0,
  );

  /**
   * Dựng bảng xem trước từ đề xuất của AI.
   *
   * Dò trùng so với các việc CHƯA XONG: việc đã xong trùng tên thường là lần
   * lặp trước của một thói quen ("chạy bộ"), chặn nó sẽ chặn nhầm.
   */
  /** `goal` là nhãn hiển thị trên đầu bảng — mục tiêu người dùng nêu, hoặc
   *  tên file khi danh sách đến từ file đính kèm. */
  private buildProposal(goal: string, todos: readonly AiSuggestedTodo[]): TodoProposal {
    const existing = new Set(
      this.store
        .todos()
        .filter((t) => !t.done)
        .map((t) => normalizeTodoContent(t.content)),
    );
    const seen = new Set<string>();

    const rows = todos
      .map((t) => t.content.trim())
      .filter((content) => content.length > 0)
      .map((content, index) => {
        const key = normalizeTodoContent(content);
        // Trùng với danh sách sẵn có, HOẶC trùng ngay trong chính đề xuất này.
        const duplicate = existing.has(key) || seen.has(key);
        seen.add(key);

        const source = todos[index];
        const due = source.due_at ? new Date(source.due_at) : null;
        return {
          id: crypto.randomUUID(),
          content,
          ...(source.description?.trim() ? { description: source.description.trim() } : {}),
          // Ngày chỉ hiện khi AI thực sự suy ra được từ điều người dùng nói.
          dueDate: due && !Number.isNaN(due.getTime()) ? toDateInputValue(due) : '',
          // Bỏ chọn sẵn việc trùng — người dùng vẫn tick lại được nếu muốn.
          selected: !duplicate,
          duplicate,
        } satisfies TodoDraftRow;
      });

    return { goal: goal.trim(), rows };
  }

  private updateProposalRow(id: string, patch: Partial<TodoDraftRow>): void {
    this.todoProposal.update((proposal) =>
      proposal
        ? { ...proposal, rows: proposal.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
        : proposal,
    );
  }

  toggleProposalRow(id: string, selected: boolean): void {
    this.updateProposalRow(id, { selected });
  }

  setProposalRowContent(id: string, content: string): void {
    this.updateProposalRow(id, { content });
  }

  setProposalRowDate(id: string, dueDate: string): void {
    this.updateProposalRow(id, { dueDate });
  }

  removeProposalRow(id: string): void {
    this.todoProposal.update((proposal) => {
      if (!proposal) return proposal;
      const rows = proposal.rows.filter((r) => r.id !== id);
      // Xoá hết dòng thì bảng không còn lý do tồn tại.
      return rows.length ? { ...proposal, rows } : null;
    });
  }

  dismissTodoProposal(): void {
    this.todoProposal.set(null);
    this.proposalError.set(null);
this.pushMessage('assistant', this.i18n.t('hub.msgTodoProposalDismissed'));
  }

  /** Chỉ ở ĐÂY mới thực sự ghi vào danh sách — sau khi người dùng bấm nút. */
  async confirmTodoProposal(): Promise<void> {
    const proposal = this.todoProposal();
    if (!proposal || this.savingProposal()) return;

    const picked = proposal.rows
      .filter((r) => r.selected && r.content.trim().length > 0)
      .map((r) => ({ ...r, content: r.content.trim() }));
    if (!picked.length) {
this.proposalError.set(this.i18n.t('hub.errPickTodo'));
      return;
    }

    this.savingProposal.set(true);
    this.proposalError.set(null);
    try {
      const list = await this.store.ensureDefaultTodoList();
      // Tuần tự chứ không Promise.all: thứ tự AI xếp ra là thứ tự làm việc,
      // gửi song song sẽ khiến chúng về đích lộn xộn.
      for (const row of picked) {
        await this.store.createTodo(row.content, list.id, {
          ...(row.description ? { description: row.description } : {}),
          ...(row.dueDate
            ? { dueAt: parseTime24(TODO_DEFAULT_TIME, fromDateInputValue(row.dueDate)) }
            : {}),
        });
      }
      this.todoProposal.set(null);
      this.pushMessage('assistant', this.i18n.t('hub.msgTodosAdded', { count: picked.length }));
    } catch (err) {
      this.proposalError.set(extractErrorMessage(err, (k) => this.i18n.t(k)));
    } finally {
      this.savingProposal.set(false);
    }
  }

  // --- File đính kèm cho AI (.ics/.csv/.pdf) ----------------------------

  protected readonly acceptAttr = ACCEPT_ATTR;

  /** File đã chọn nhưng CHƯA gửi — hiện dưới dạng thẻ trên ô nhập. */
  protected readonly pendingFile = signal<File | null>(null);

  protected readonly pendingFileExt = computed(() => {
    const name = this.pendingFile()?.name ?? "";
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot).toLowerCase();
  });

  protected readonly pendingFileSizeLabel = computed(() => {
    const size = this.pendingFile()?.size ?? 0;
    return size ? (size / 1024).toFixed(1) + ' KB' : '';
  });

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset ngay để chọn lại đúng file vừa xoá vẫn kích hoạt change.
    input.value = '';
    this.handleFile(file);
  }

  /**
   * Dán file bằng Ctrl+V / Cmd+V ngay trong khung chat.
   *
   * KHÔNG chặn thao tác dán thông thường: chỉ can thiệp khi clipboard thật sự
   * mang theo file và KHÔNG có chữ nào để dán. Người dùng copy một đoạn text
   * (kể cả text lấy từ trong file PDF) thì đó vẫn là text — dán vào ô nhập như
   * mọi khi, vì trình duyệt không hề đưa ra đối tượng File nào.
   */
  onComposerPaste(event: ClipboardEvent): void {
    if (this.sending()) return;

    const data = event.clipboardData;
    const picked = pickSingleFile(data);
    if (!picked.file) return;

    // Trình duyệt đã khai đây là lần dán FILE thì tin nó. Chỉ khi tín hiệu mơ
    // hồ (có đối tượng File nhưng types không có "Files") mới ưu tiên giữ chữ
    // để không cướp mất thao tác dán văn bản thông thường.
    if (!signalsFiles(data) && hasMeaningfulText(data)) return;

    // Tới đây chắc chắn là dán file. Chặn hành vi mặc định để đường dẫn file
    // không bị dán thành chữ vào ô nhập.
    event.preventDefault();
    this.handleFile(picked.file, picked.skipped);
  }

  /**
   * Điểm vào DUY NHẤT cho mọi file, bất kể đến từ nút đính kèm, clipboard hay
   * kéo-thả. Nhờ vậy validation không thể lệch nhau giữa các cách đưa file vào.
   */
  private handleFile(file: File | null | undefined, skipped = 0): void {
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!ACCEPTED_FILE_EXT.some((ext) => name.endsWith(ext))) {
      this.aiError.set(this.i18n.t('hub.errFileType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
  this.aiError.set(this.i18n.t('hub.errFileSize'));
      return;
    }

    this.cancelChipExit();
    this.pendingFile.set(file);
    // Câu thông báo lấy từ utility chung nên ba nguồn file nói giống hệt nhau.
    this.aiError.set(skippedFilesMessage(skipped));
  }

  // --- Kéo-thả file vào khung chat --------------------------------------

  protected readonly dragActive = signal(false);

  /**
   * Đếm dragenter trừ dragleave.
   *
   * Kéo qua các phần tử con bên trong panel sinh ra một cặp leave/enter mỗi
   * lần, nên nếu tắt highlight ngay ở dragleave đầu tiên thì trạng thái sẽ
   * nhấp nháy rồi kẹt. Chỉ tắt khi bộ đếm về 0, tức là đã rời hẳn panel.
   */
  private dragDepth = 0;

  /** Lần kéo này có thật sự mang file không — dựa vào chính khai báo của
   *  trình duyệt, không đoán từ việc có hay không có text. */
  private isFileDrag(event: DragEvent): boolean {
    return !this.sending() && signalsFiles(event.dataTransfer);
  }

  onDragEnter(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;
    this.dragDepth += 1;
    this.dragActive.set(true);
  }

  onDragOver(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;
    // Bắt buộc phải chặn mặc định ở dragover, nếu không trình duyệt sẽ không
    // phát sự kiện drop. Chỉ chặn trong vùng này chứ không chặn toàn trang.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onDragLeave(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;
    this.dragDepth = Math.max(this.dragDepth - 1, 0);
    if (this.dragDepth === 0) this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;

    // Không chặn thì trình duyệt sẽ mở thẳng file, rời khỏi ứng dụng.
    event.preventDefault();
    this.dragDepth = 0;
    this.dragActive.set(false);

    const picked = pickSingleFile(event.dataTransfer);
    // Kéo chữ hay đường dẫn vào thì không có File thật — không dựng file giả.
    if (!picked.file) return;
    this.handleFile(picked.file, picked.skipped);
  }

  /** Chip đang chạy animation rời đi — vẫn còn trong DOM cho tới khi xong. */
  protected readonly removingFile = signal(false);

  /** Khớp thời lượng keyframe chipOut trong floating-hub.css. */
  private static readonly CHIP_EXIT_MS = 130;
  private chipExitTimer: ReturnType<typeof setTimeout> | null = null;

  /** Huỷ lần rời đi đang dang dở. Không có bước này thì chọn file mới ngay sau
   *  khi bấm × sẽ bị hẹn giờ cũ xoá mất. */
  private cancelChipExit(): void {
    if (this.chipExitTimer) {
      clearTimeout(this.chipExitTimer);
      this.chipExitTimer = null;
    }
    this.removingFile.set(false);
  }

  clearPendingFile(): void {
    if (!this.pendingFile() || this.removingFile()) return;
    // Gỡ khỏi state SAU animation, nếu không chip biến mất tức thì và composer
    // giật một nhịp.
    this.removingFile.set(true);
    this.chipExitTimer = setTimeout(() => {
      this.pendingFile.set(null);
      this.chipExitTimer = null;
      this.removingFile.set(false);
    }, FloatingHub.CHIP_EXIT_MS);
  }

  // --- Sự kiện do AI đọc từ file (bảng xem trước, CHƯA lưu) -------------

  protected readonly eventProposal = signal<EventProposal | null>(null);
  protected readonly savingEvents = signal(false);
  protected readonly eventProposalError = signal<string | null>(null);

  protected readonly selectedEventCount = computed(
    () => this.eventProposal()?.rows.filter((r) => r.selected).length ?? 0,
  );

  /** Số dòng file không nêu đủ ngày giờ — hiện thành lời nhắc trên bảng. */
  protected readonly incompleteEventCount = computed(
    () => this.eventProposal()?.rows.filter((r) => !r.startLocal).length ?? 0,
  );

  private buildEventProposal(fileName: string, events: readonly AiFileEvent[]): EventProposal {
    const rows = events.map((e) => {
      const startLocal = toDatetimeLocal(e.start);
      // Thiếu giờ kết thúc thì mặc định 1 tiếng — chỉ khi ĐÃ có giờ bắt đầu
      // thật từ file, nên đây là quy ước hiển thị chứ không phải bịa dữ liệu.
      const endLocal =
        toDatetimeLocal(e.end) ||
        (e.start ? toDatetimeLocal(new Date(new Date(e.start).getTime() + 3_600_000).toISOString()) : "");
      return {
        id: crypto.randomUUID(),
        title: e.title,
        startLocal,
        endLocal,
        allDay: e.allDay ?? false,
        location: e.location ?? "",
        ...(e.description ? { description: e.description } : {}),
        ...(e.missing ? { missing: e.missing } : {}),
        // Dòng thiếu ngày giờ KHÔNG tick sẵn: lưu lúc này là lưu dữ liệu rỗng.
        selected: !!startLocal,
      } satisfies EventDraftRow;
    });
    return { fileName, rows };
  }

  private updateEventRow(id: string, patch: Partial<EventDraftRow>): void {
    this.eventProposal.update((proposal) =>
      proposal
        ? { ...proposal, rows: proposal.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
        : proposal,
    );
  }

  toggleEventRow(id: string, selected: boolean): void {
    this.updateEventRow(id, { selected });
  }

  setEventRowTitle(id: string, title: string): void {
    this.updateEventRow(id, { title });
  }

  setEventRowStart(id: string, startLocal: string): void {
    this.updateEventRow(id, { startLocal });
  }

  setEventRowEnd(id: string, endLocal: string): void {
    this.updateEventRow(id, { endLocal });
  }

  setEventRowLocation(id: string, location: string): void {
    this.updateEventRow(id, { location });
  }

  removeEventRow(id: string): void {
    this.eventProposal.update((proposal) => {
      if (!proposal) return proposal;
      const rows = proposal.rows.filter((r) => r.id !== id);
      return rows.length ? { ...proposal, rows } : null;
    });
  }

  /** Chọn tất cả — trừ dòng thiếu ngày giờ, vì lưu chúng sẽ tạo sự kiện rỗng. */
  selectAllEvents(selected: boolean): void {
    this.eventProposal.update((proposal) =>
      proposal
        ? {
            ...proposal,
            rows: proposal.rows.map((r) => ({ ...r, selected: selected && !!r.startLocal })),
          }
        : proposal,
    );
  }

  dismissEventProposal(): void {
    this.eventProposal.set(null);
    this.eventProposalError.set(null);
this.pushMessage('assistant', this.i18n.t('hub.msgEventProposalDismissed'));
  }

  /** Chỉ ở ĐÂY mới thực sự ghi vào lịch — sau khi người dùng bấm nút. */
  async confirmEventProposal(): Promise<void> {
    const proposal = this.eventProposal();
    if (!proposal || this.savingEvents()) return;

    const picked = proposal.rows.filter((r) => r.selected && r.title.trim() && r.startLocal);
    if (!picked.length) {
this.eventProposalError.set(this.i18n.t('hub.errPickEvent'));
      return;
    }

    this.savingEvents.set(true);
    this.eventProposalError.set(null);
    try {
      const calendar = await this.store.ensureCalendarExists();
      const drafts = picked.map((row) => {
        const start = new Date(row.startLocal);
        const end = row.endLocal ? new Date(row.endLocal) : new Date(start.getTime() + 3_600_000);
        return {
          title: row.title.trim(),
          calendarId: calendar.id,
          start,
          end: end > start ? end : new Date(start.getTime() + 3_600_000),
          allDay: row.allDay,
          ...(row.location.trim() ? { location: row.location.trim() } : {}),
          ...(row.description ? { description: row.description } : {}),
        };
      });
      // MỘT request cho cả lô, không phải N lần createEvent.
      //
      // Mỗi createEvent làm server phát một gói event:created cho phòng lịch.
      // Gói đó thường về TRƯỚC phản hồi HTTP nên chưa kịp nhận ra là do chính
      // mình vừa tạo — xác nhận 3 sự kiện là nổ 3 popup và chuông cộng 3.
      // importEvents gửi kèm một batchId nên cả lô chỉ còn một gói socket và
      // đúng một dòng thông báo, giống hệt màn hình Import.
      await this.store.importEvents(calendar.id, drafts);
      this.eventProposal.set(null);
      this.pushMessage('assistant', this.i18n.t('hub.msgEventsAdded', { count: picked.length }));
    } catch (err) {
      this.eventProposalError.set(extractErrorMessage(err, (k) => this.i18n.t(k)));
    } finally {
      this.savingEvents.set(false);
    }
  }

  /** Chọn/bỏ chọn tất cả cho bảng việc cần làm. */
  selectAllTodos(selected: boolean): void {
    this.todoProposal.update((proposal) =>
      proposal ? { ...proposal, rows: proposal.rows.map((r) => ({ ...r, selected })) } : proposal,
    );
  }

  /** Dựng bảng xem trước từ kết quả đọc file. Không lưu gì. */
  private applyFileAnalysis(analysis: AiFileAnalysis): void {
    const lines = [analysis.summary];

    if (analysis.events.length) {
      this.eventProposal.set(this.buildEventProposal(analysis.fileName, analysis.events));
      this.eventProposalError.set(null);
    }
    if (analysis.todos.length) {
      this.todoProposal.set(this.buildProposal(analysis.fileName, analysis.todos));
      this.proposalError.set(null);
    }

    if (analysis.kind === 'none') {
      lines.push(this.i18n.t('hub.msgFileDescribeMore'));
    } else {
      lines.push(this.i18n.t('hub.msgReviewThenAdd'));
    }
    this.pushMessage('assistant', lines.join('\n'));
  }

  private pushMessage(
    role: ChatMessage['role'],
    text: string,
    suggestManualForm?: boolean,
    guessedTitle?: string,
    attachmentName?: string,
  ): void {
    this.messages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), role, text, suggestManualForm, guessedTitle, attachmentName },
    ]);
    this.scrollToBottom();
  }

  /** Tin nhắn kèm thẻ sự kiện. Tách riêng khỏi pushMessage() chứ không thêm
   *  tham số thứ sáu vào đó — chỗ gọi sẽ thành một dãy undefined không ai đọc
   *  nổi. */
  private pushEventMessage(text: string, event: ChatEventCard): void {
    this.messages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), role: 'assistant' as const, text, event },
    ]);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.messages');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
