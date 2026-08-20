import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CalendarMemberRole } from '../../models/calendar.models';

@Component({
  selector: 'app-invite-modal',
  templateUrl: './invite-modal.html',
  styleUrl: './invite-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteModal {
  private readonly store = inject(CalendarStore);

  readonly calendarId = input.required<string>();
  readonly calendarName = input.required<string>();
  readonly closed = output<void>();

  protected readonly email = signal('');
  protected readonly role = signal<CalendarMemberRole>('viewer');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly successEmail = signal<string | null>(null);

  setRole(role: CalendarMemberRole): void {
    this.role.set(role);
  }

  async send(): Promise<void> {
    const email = this.email().trim();
    if (!email || this.sending()) return;

    this.sending.set(true);
    this.error.set(null);
    this.successEmail.set(null);
    try {
      await this.store.inviteToCalendar(this.calendarId(), email, this.role());
      this.successEmail.set(email);
      this.email.set('');
    } catch (err) {
      const message = (err as { error?: { message?: string | string[] } })?.error?.message;
      this.error.set(
        (Array.isArray(message) ? message[0] : message) ?? 'Không thể gửi lời mời. Vui lòng thử lại.',
      );
    } finally {
      this.sending.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
