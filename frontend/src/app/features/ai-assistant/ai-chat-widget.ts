import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
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
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { message?: string | string[] } }).error;
    const msg = inner?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${dateFmt.format(start)} - ${timeFmt.format(end)}`;
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
    try {
      const result = await this.store.sendAiChat(text, calendarId);
      if (result.intent === 'create_event') {
        this.pushMessage(
          'assistant',
          `Đã tạo sự kiện: ${result.event.title} (${formatRange(result.event.start, result.event.end)})`,
        );
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
