import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { CalendarStore } from '../../data/calendar-store';
import { FormsModule } from '@angular/forms';

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

@Component({
  selector: 'app-import-modal',
  templateUrl: './import-modal.html',
  styleUrl: './import-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ImportModalComponent {
  private readonly http = inject(HttpClient);
  protected readonly store = inject(CalendarStore);

  readonly closed = output<void>();

  readonly mode = signal<'standard' | 'smart'>('standard');
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
      this.parseError.set(null);
    }
  }

  setMode(m: 'standard' | 'smart'): void {
    this.mode.set(m);
    this.parseError.set(null);
  }

  async parseFile(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      this.parseError.set('Vui lòng chọn 1 file trước.');
      return;
    }

    this.parsing.set(true);
    this.parseError.set(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', this.mode());

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
    } catch (err: any) {
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
      } catch (backendErr) {
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
      setTimeout(() => this.closed.emit(), 1200);
    } catch (err: any) {
      this.parseError.set(err?.error?.message || 'Lỗi khi lưu sự kiện hàng loạt.');
    } finally {
      this.importing.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
