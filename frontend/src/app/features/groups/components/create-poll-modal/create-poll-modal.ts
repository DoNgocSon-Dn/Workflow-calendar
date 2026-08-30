import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GroupStore } from '../../data/group-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-create-poll-modal',
  templateUrl: './create-poll-modal.html',
  styleUrl: './create-poll-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class CreatePollModal {
  private readonly groupStore = inject(GroupStore);
  protected readonly i18n = inject(TranslationService);

  readonly closed = output<void>();

  protected readonly question = signal('');
  protected readonly options = signal<string[]>(['', '']);
  protected readonly allowMultiple = signal(false);
  protected readonly anonymous = signal(false);
  protected readonly creating = signal(false);
  protected readonly error = signal<string | null>(null);

  setOption(i: number, value: string): void {
    this.options.update((list) => list.map((o, idx) => (idx === i ? value : o)));
  }

  addOption(): void {
    if (this.options().length >= 12) return;
    this.options.update((list) => [...list, '']);
  }

  removeOption(i: number): void {
    if (this.options().length <= 2) return;
    this.options.update((list) => list.filter((_, idx) => idx !== i));
  }

  protected canCreate(): boolean {
    return (
      !this.creating() &&
      this.question().trim().length > 0 &&
      this.options().filter((o) => o.trim()).length >= 2
    );
  }

  async create(): Promise<void> {
    const group = this.groupStore.activeGroup();
    if (!group || !this.canCreate()) return;
    this.creating.set(true);
    this.error.set(null);
    try {
      await this.groupStore.createPoll(group.id, {
        question: this.question().trim(),
        options: this.options().map((o) => o.trim()).filter(Boolean),
        allowMultiple: this.allowMultiple(),
        anonymous: this.anonymous(),
      });
      this.closed.emit();
    } catch (err: any) {
      this.error.set(err?.error?.message || this.i18n.t('poll.createError'));
    } finally {
      this.creating.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
