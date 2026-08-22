import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../calendar/data/calendar-store';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestManualForm?: boolean;
  guessedTitle?: string;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Không kết nối được tới server, vui lòng kiểm tra lại và thử lại.';
    }
    const inner = err.error as { message?: string | string[] } | undefined;
    const msg = inner?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

function isDeleteIntent(text: string): boolean {
  return /\b(xóa|xoá|hủy|huỷ)\b/i.test(text);
}

function formatDateLabel(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  const absolute = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  // Luôn kèm ngày cụ thể bên cạnh nhãn tương đối — chat có thể được xem lại
  // vào ngày khác, lúc đó "Ngày mai" một mình sẽ không còn đúng nghĩa nữa.
  if (diffDays === 0) return `Hôm nay (${absolute})`;
  if (diffDays === 1) return `Ngày mai (${absolute})`;
  return absolute;
}

function formatEventPreview(event: { title: string; start: string; end: string; location?: string }): string {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const invalid = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime());
  const timeFmt = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const lines = [
    `✓ Tiêu đề: ${event.title}`,
    `📅 Ngày: ${invalid ? event.start : formatDateLabel(start)}`,
    `🕘 Thời gian: ${invalid ? `${event.start} - ${event.end}` : `${timeFmt.format(start)} – ${timeFmt.format(end)}`}`,
  ];
  if (event.location) lines.push(`📍 Địa điểm: ${event.location}`);
  return lines.join('\n');
}

@Component({
  selector: 'app-ai-chat-widget',
  templateUrl: './ai-chat-widget.html',
  styleUrl: './ai-chat-widget.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class AiChatWidget {
  private readonly store = inject(CalendarStore);

  readonly open = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  private readonly lastCreatedEventId = signal<string | null>(null);

  readonly openManualForm = output<string>();

  toggle(): void {
    this.open.update((v) => !v);
  }

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    const calendarId = this.store.calendars()[0]?.id;
    if (!calendarId) {
      this.error.set('Bạn chưa có lịch nào để tạo sự kiện.');
      return;
    }

    this.pushMessage('user', text);
    this.draft.set('');
    this.sending.set(true);
    this.error.set(null);

    if (isDeleteIntent(text)) {
      await this.handleDeleteIntent();
      this.sending.set(false);
      return;
    }

    try {
      const result = await this.store.sendAiChat(text, calendarId);
      if (result.intent === 'create_event') {
        this.lastCreatedEventId.set(result.event.id);
        this.pushMessage('assistant', `Đã tạo sự kiện:\n${formatEventPreview(result.event)}`);
      } else {
        this.pushMessage(
          'assistant',
          'Mình chưa chắc chắn về thời gian trong câu này — hãy mở form để nhập tay nhé.',
          true,
          result.title,
        );
      }
    } catch (err) {
      this.error.set(extractErrorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }

  private async handleDeleteIntent(): Promise<void> {
    const id = this.lastCreatedEventId();
    if (!id) {
      this.pushMessage(
        'assistant',
        'Mình chưa tạo sự kiện nào trong phiên chat này để xóa cả — bạn có thể xóa trực tiếp trên lịch nhé.',
      );
      return;
    }
    await this.store.deleteEvent(id);
    this.lastCreatedEventId.set(null);
    this.pushMessage('assistant', 'Đã xóa sự kiện vừa tạo.');
  }

  readonly suggestions = [
    'Họp team 9h sáng mai',
    'Ăn tối 19:30 ngày mai',
    'Chạy bộ 6h sáng mai trong 30 phút',
    'Gặp đối tác thứ 2 tuần sau 14h',
  ];

  sendSuggestion(suggestion: string): void {
    this.draft.set(suggestion);
    this.send();
  }

  private pushMessage(
    role: ChatMessage['role'],
    text: string,
    suggestManualForm?: boolean,
    guessedTitle?: string,
  ): void {
    this.messages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), role, text, suggestManualForm, guessedTitle },
    ]);
  }
}
