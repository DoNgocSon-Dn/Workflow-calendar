import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { DialogService } from '../../../../core/services/dialog.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { CalendarStore } from '../../data/calendar-store';
import { FormsModule } from '@angular/forms';
import { OverflowTooltip } from '../../../../shared/directives/overflow-tooltip';
import {
  hasMeaningfulText,
  pickSingleFile,
  signalsFiles,
  skippedFilesMessage,
} from '../../../../shared/utils/clipboard-files';

/**
 * Khớp với `MAX_UPLOAD_BYTES` / `ALLOWED_IMPORT_EXTENSIONS` ở backend
 * (backend/src/common/limits.ts).
 *
 * Kiểm tra ở đây CHỈ để báo lỗi sớm cho người dùng, không phải lớp bảo vệ:
 * backend vẫn kiểm lại độc lập ở multer và ở service.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_LABEL = '10 MB';
const ALLOWED_EXTENSIONS = ['.ics', '.csv'] as const;

/**
 * Server có CHỦ ĐÍCH từ chối request này hay không.
 *
 * Quan trọng vì màn hình import có sẵn một bộ đọc file cục bộ làm phương án
 * dự phòng khi mất mạng. Nếu dự phòng đó chạy cả khi server trả 400/413/429
 * thì mọi giới hạn phía backend (dung lượng, số sự kiện, hạn mức gọi) đều bị
 * đi vòng ngay trên trình duyệt — và tệ hơn, người dùng không thấy lỗi gì.
 * Chỉ coi là "không gọi được" khi status 0 (mất mạng/CORS) hoặc 5xx.
 */
function isServerRejection(err: unknown): err is HttpErrorResponse {
  return err instanceof HttpErrorResponse && err.status > 0 && err.status < 500;
}

function serverErrorMessage(err: HttpErrorResponse, fallback: string): string {
  const body = err.error as { message?: string | string[] } | undefined;
  const msg = body?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (err.status === 429) return 'Bạn đã vượt quá giới hạn import. Vui lòng thử lại sau.';
  if (err.status === 413) return 'File vượt quá giới hạn cho phép.';
  return fallback;
}

export interface ParsedImportEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  needsReview?: boolean;
}

export interface ParsedImportEventUI {
  title: string;
  startLocal: string;
  endLocal: string;
  allDay: boolean;
  location?: string;
  description?: string;
  needsReview?: boolean;
}

export interface ConflictInfo {
  id: string;
  title: string;
  start: string;
  end: string;
}

function toDatetimeLocal(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(dtLocalStr: string): string {
  if (!dtLocalStr) return new Date().toISOString();
  const d = new Date(dtLocalStr);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Trang riêng `/calendar/import` — trước là modal nổi trên trang lịch, giờ
 *  là trang đầy đủ vì bảng xem trước sự kiện (5 cột, có thể nhiều dòng) cần
 *  nhiều chỗ hơn một hộp thoại cho được. */
@Component({
  selector: 'app-import-modal',
  templateUrl: './import-modal.html',
  styleUrl: './import-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, OverflowTooltip],
  // Nghe ở cấp document vì vùng thả file là một <label>, không nhận được
  // focus nên sự kiện paste không bao giờ bay tới nó. Trang này chỉ tồn tại
  // lúc route đang active, nên phạm vi này là đúng.
  host: {
    '(document:paste)': 'onPaste($event)',
    // Escape phải đi qua CÙNG một chốt kiểm tra như nút Hủy — nếu không sẽ
    // thành nghịch lý: bấm Hủy thì được hỏi, nhấn Escape thì mất trắng.
    '(document:keydown.escape)': 'onEscape($event)',
    '[class.is-closing]': 'closing()',
  },
})
export class ImportModalComponent {
  private readonly http = inject(HttpClient);
  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);

  readonly selectedFile = signal<File | null>(null);
  readonly parsing = signal(false);
  readonly parseError = signal<string | null>(null);

  readonly eventsPreview = signal<ParsedImportEventUI[]>([]);
  readonly conflicts = signal<ConflictInfo[]>([]);
  readonly selectedCalendarId = signal<string>('');
  readonly importing = signal(false);
  readonly importSuccess = signal(false);

  constructor() {
    const cals = this.store.calendars();
    if (cals.length > 0) {
      this.selectedCalendarId.set(cals[0].id);
    }
  }

  protected readonly selectedFileExt = computed(() => {
    const name = this.selectedFile()?.name ?? '';
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot + 1).toUpperCase();
  });

  protected readonly selectedFileSizeLabel = computed(() => {
    const size = this.selectedFile()?.size ?? 0;
    if (!size) return '';
    return size >= 1024 * 1024
      ? (size / 1024 / 1024).toFixed(1) + ' MB'
      : (size / 1024).toFixed(1) + ' KB';
  });

  clearSelectedFile(): void {
    this.selectedFile.set(null);
    this.parseError.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset để lần chọn sau vẫn kích hoạt change, kể cả chọn lại đúng file cũ.
    input.value = '';
    this.handleFile(file);
  }

  /**
   * Dán file .ics/.csv bằng Ctrl+V / Cmd+V khi popup đang mở.
   *
   * Không đụng tới thao tác dán chữ: bảng xem trước có nhiều ô nhập (tiêu đề,
   * địa điểm, thời gian) và người dùng phải dán chữ vào đó được như thường.
   * Chỉ can thiệp khi clipboard mang file thật và không có chữ nào.
   */
  onPaste(event: ClipboardEvent): void {
    if (this.importSuccess() || this.parsing() || this.importing()) return;

    const data = event.clipboardData;
    const picked = pickSingleFile(data);
    if (!picked.file) return;
    // Trình duyệt đã khai đây là lần dán FILE thì tin nó. Chỉ khi tín hiệu mơ
    // hồ (có đối tượng File nhưng types không có "Files") mới ưu tiên giữ chữ
    // để không cướp mất thao tác dán văn bản thông thường.
    if (!signalsFiles(data) && hasMeaningfulText(data)) return;

    event.preventDefault();
    this.handleFile(picked.file, picked.skipped);
  }

  /**
   * Điểm vào DUY NHẤT cho mọi file, bất kể chọn bằng nút hay dán từ clipboard.
   * Một chỗ kiểm tra nghĩa là không thể có đường nào lọt qua mà chưa validate.
   */
  private handleFile(file: File | null | undefined, skipped = 0): void {
    if (!file) return;

    const problem = this.validateFile(file);
    if (problem) {
      this.selectedFile.set(null);
      this.parseError.set(problem);
      return;
    }

    this.selectedFile.set(file);
    // Câu thông báo lấy từ utility chung nên ba nguồn file nói giống hệt nhau.
    this.parseError.set(skippedFilesMessage(skipped));
  }

  // --- Kéo-thả file vào vùng chọn file ----------------------------------

  readonly dragActive = signal(false);

  /** Xem chú thích cùng tên bên FloatingHub: đếm enter/leave để highlight
   *  không bị kẹt khi con trỏ đi qua các phần tử con. */
  private dragDepth = 0;

  private isFileDrag(event: DragEvent): boolean {
    if (this.importSuccess() || this.parsing() || this.importing()) return false;
    return signalsFiles(event.dataTransfer);
  }

  onDragEnter(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;
    this.dragDepth += 1;
    this.dragActive.set(true);
  }

  onDragOver(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;
    // Không chặn mặc định ở dragover thì trình duyệt sẽ không phát drop.
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

    event.preventDefault();
    this.dragDepth = 0;
    this.dragActive.set(false);

    const picked = pickSingleFile(event.dataTransfer);
    if (!picked.file) return;
    // Chỉ đưa file vào trạng thái đã chọn. KHÔNG tự import — người dùng vẫn
    // phải bấm "Đọc file sự kiện" rồi "Xác nhận Lưu vào Lịch" như cũ.
    this.handleFile(picked.file, picked.skipped);
  }

  /** Trả về câu lỗi, hoặc null nếu file dùng được. */
  private validateFile(file: File): string | null {
    const name = file.name.toLowerCase();
    // Thuộc tính `accept` chỉ lọc hộp thoại chọn file — kéo-thả hoặc chọn
    // "Tất cả tệp" vẫn lọt, nên phải tự kiểm.
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return 'Chỉ hỗ trợ file .ics hoặc .csv. File .xlsx, .docx hoặc .pdf hãy gửi cho Trợ lý AI.';
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return `File vượt quá giới hạn ${MAX_UPLOAD_LABEL} (file của bạn ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
    }
    return null;
  }


  async parseFile(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      this.parseError.set('Vui lòng chọn 1 file trước.');
      return;
    }

    const problem = this.validateFile(file);
    if (problem) {
      this.parseError.set(problem);
      return;
    }

    this.parsing.set(true);
    this.parseError.set(null);

    const formData = new FormData();
    formData.append('file', file);
    // Popup chỉ còn import chuẩn; chế độ 'smart' đã chuyển sang Trợ lý AI.
    formData.append('mode', 'standard');

    try {
      const res = await firstValueFrom(
        this.http.post<{ events: ParsedImportEvent[]; conflicts: ConflictInfo[] }>(
          `${environment.apiUrl}/calendars/import`,
          formData,
        ),
      );
      if (res && res.events && res.events.length > 0) {
        const uiEvents: ParsedImportEventUI[] = res.events.map((e) => ({
          title: e.title,
          startLocal: toDatetimeLocal(e.start),
          endLocal: toDatetimeLocal(e.end),
          allDay: e.allDay,
          location: e.location,
          description: e.description,
          needsReview: e.needsReview,
        }));
        this.eventsPreview.set(uiEvents);
        this.conflicts.set(res.conflicts || []);
        this.parsing.set(false);
        return;
      }
    } catch (err: unknown) {
      if (isServerRejection(err)) {
        // Server đã xem file và từ chối (quá lớn, quá nhiều sự kiện, sai định
        // dạng, hết hạn mức). Hiện đúng lý do, KHÔNG tự parse cục bộ để lách.
        this.parseError.set(
          serverErrorMessage(err, 'Không import được file. Vui lòng kiểm tra lại nội dung file.'),
        );
        this.parsing.set(false);
        return;
      }
      console.warn('Import qua Backend không phản hồi, tự động dùng bộ đọc file cục bộ:', err);
    }

    // Fallback local file parser in browser
    try {
      const localEvents = await this.parseFileLocally(file);
      const uiEvents: ParsedImportEventUI[] = localEvents.map((e) => ({
        title: e.title,
        startLocal: toDatetimeLocal(e.start),
        endLocal: toDatetimeLocal(e.end),
        allDay: e.allDay,
        location: e.location,
        description: e.description,
        needsReview: e.needsReview,
      }));
      this.eventsPreview.set(uiEvents);
      if (uiEvents.length === 0) {
        this.parseError.set('Không đọc được sự kiện từ file. Vui lòng kiểm tra lại nội dung file.');
      }
    } catch (err: any) {
      this.parseError.set('Lỗi khi đọc file. Vui lòng thử lại với file .ics, .csv hoặc .txt');
    } finally {
      this.parsing.set(false);
    }
  }

  private parseFileLocally(file: File): Promise<ParsedImportEvent[]> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || '';
        const events: ParsedImportEvent[] = [];
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const now = new Date();

        if (text.includes('BEGIN:VCALENDAR') || text.includes('BEGIN:VEVENT')) {
          const vevents = text.split('BEGIN:VEVENT');
          for (let i = 1; i < vevents.length; i++) {
            const block = vevents[i];
            const summaryMatch = block.match(/SUMMARY:(.*)/i);
            const dtstartMatch = block.match(/DTSTART[:;](.*)/i);
            const dtendMatch = block.match(/DTEND[:;](.*)/i);
            const locMatch = block.match(/LOCATION:(.*)/i);

            const title = summaryMatch ? summaryMatch[1].trim() : `Sự kiện ${i}`;
            let start = new Date();
            if (dtstartMatch) {
              const val = dtstartMatch[1].replace(/[^0-9T]/g, '');
              if (val.length >= 8) {
                const y = parseInt(val.substring(0, 4));
                const m = parseInt(val.substring(4, 6)) - 1;
                const d = parseInt(val.substring(6, 8));
                start = new Date(y, m, d, 9, 0);
              }
            }
            const end = new Date(start.getTime() + 3600000);

            events.push({
              title,
              start: start.toISOString(),
              end: end.toISOString(),
              allDay: false,
              location: locMatch ? locMatch[1].trim() : undefined,
            });
          }
        } else {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (
              line.length > 2 &&
              !line.toLowerCase().startsWith('title') &&
              !line.toLowerCase().startsWith('subject') &&
              !line.startsWith('---')
            ) {
              const parts = line.split(/[,;\t]/).map((p) => p.replace(/^"|"$/g, '').trim());
              const title = parts[0] || `Sự kiện ${i + 1}`;
              const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
              let start = new Date(now.getTime() + i * 86400000);
              if (dateMatch) {
                const day = parseInt(dateMatch[1]);
                const month = parseInt(dateMatch[2]) - 1;
                let year = parseInt(dateMatch[3]);
                if (year < 100) year += 2000;
                start = new Date(year, month, day, 9, 0);
              }
              const end = new Date(start.getTime() + 3600000);
              events.push({
                title,
                start: start.toISOString(),
                end: end.toISOString(),
                allDay: false,
                description: line,
                needsReview: true,
              });
            }
          }
        }
        resolve(events);
      };
      reader.readAsText(file);
    });
  }

  removeEvent(index: number): void {
    this.eventsPreview.update((list) => list.filter((_, i) => i !== index));
  }

  async confirmImport(): Promise<void> {
    const events = this.eventsPreview();
    let calId = this.selectedCalendarId();
    if (!calId) {
      const defaultCal = await this.store.ensureCalendarExists();
      calId = defaultCal.id;
    }

    if (events.length === 0) {
      this.parseError.set('Danh sách sự kiện nhập trống.');
      return;
    }

    this.importing.set(true);
    try {
      const dtos = events.map((e) => ({
        calendarId: calId,
        title: e.title,
        start: fromDatetimeLocal(e.startLocal),
        end: fromDatetimeLocal(e.endLocal),
        allDay: e.allDay,
        location: e.location,
        description: e.description,
      }));

      try {
        await firstValueFrom(
          this.http.post(`${environment.apiUrl}/events/bulk-create`, {
            calendarId: calId,
            events: dtos,
          }),
        );
      } catch (backendErr: unknown) {
        if (isServerRejection(backendErr)) {
          // Cùng lý do như trên: server từ chối thì dừng, không vòng qua
          // đường tạo từng sự kiện một để lách giới hạn số lượng.
          this.parseError.set(
            serverErrorMessage(
              backendErr,
              'Không lưu được danh sách sự kiện. Vui lòng thử lại.',
            ),
          );
          this.importing.set(false);
          return;
        }
        console.warn('Lưu bulk lên backend thất bại, tự động tạo sự kiện cục bộ:', backendErr);
        for (const e of events) {
          await this.store.createEvent({
            title: e.title,
            calendarId: calId,
            start: new Date(fromDatetimeLocal(e.startLocal)),
            end: new Date(fromDatetimeLocal(e.endLocal)),
            allDay: e.allDay,
            location: e.location,
            description: e.description,
          });
        }
      }

      this.importSuccess.set(true);
      // importSuccess() = true nên isImportDirty() đã là false — không hỏi lại.
      setTimeout(() => void this.cancel(), 1200);
    } catch (err: any) {
      this.parseError.set(err?.error?.message || 'Lỗi khi lưu sự kiện hàng loạt.');
    } finally {
      this.importing.set(false);
    }
  }

  /**
   * Phiên import đã có thứ để mất hay chưa.
   *
   * Chỉ hỏi lại khi người dùng thực sự có nguy cơ mất công sức: đã chọn/thả/
   * dán một file, hoặc đã đọc ra được danh sách sự kiện. Hỏi khi màn hình còn
   * trống chỉ làm phiền và khiến người ta bấm bừa qua cảnh báo về sau.
   *
   * Import xong thì hết dirty — dữ liệu đã nằm trong lịch, không còn gì để mất.
   */
  readonly isImportDirty = computed(
    () => !this.importSuccess() && (this.selectedFile() !== null || this.eventsPreview().length > 0),
  );

  /** Đang chạy animation rời trang. Cũng là chốt chặn double-click. */
  protected readonly closing = signal(false);

  /** Khớp thời lượng keyframe pageOut trong import-modal.css. */
  private static readonly EXIT_MS = 180;

  onEscape(event: Event): void {
    // Dialog xác nhận đang mở thì Escape thuộc về nó — DialogHost tự xử lý.
    // Không chặn ở đây sẽ đóng cả hai lớp cùng lúc.
    if (this.dialog.request()) return;
    event.preventDefault();
    void this.cancel();
  }

  async cancel(): Promise<void> {
    // Bấm liên tục hoặc Escape dồn dập không được xếp chồng nhiều lần đóng.
    if (this.closing()) return;

    if (this.isImportDirty()) {
      const confirmed = await this.dialog.confirm(
        'Dữ liệu hoặc file bạn đã thêm sẽ không được lưu. Bạn có chắc chắn muốn hủy?',
        {
          title: 'Hủy quá trình import?',
          confirmLabel: 'Hủy Import',
          cancelLabel: 'Tiếp tục Import',
          danger: true,
        },
      );
      // "Tiếp tục Import": không đụng gì tới file/dữ liệu đang có.
      if (!confirmed) return;
    }

    this.leave();
  }

  /**
   * Chạy animation rời trang rồi mới điều hướng.
   *
   * Điều hướng ngay sẽ gỡ component tức thì và animation không kịp hiện frame
   * nào. Dialog xác nhận (nếu có) đang mờ dần cùng lúc này — hai chuyển động
   * chồng lên nhau nên mắt thấy một dòng chảy liền mạch.
   */
  private leave(): void {
    this.closing.set(true);
    setTimeout(() => {
      void this.router.navigate(['/calendar']);
    }, ImportModalComponent.EXIT_MS);
  }
}
