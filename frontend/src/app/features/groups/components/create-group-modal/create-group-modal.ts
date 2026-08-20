import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GroupStore } from '../../data/group-store';

type GroupColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';

const COLOR_HEX: Record<GroupColor, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  teal: '#14b8a6',
};

const COLORS: GroupColor[] = ['blue', 'green', 'orange', 'red', 'purple', 'teal'];

@Component({
  selector: 'app-create-group-modal',
  templateUrl: './create-group-modal.html',
  styleUrl: './create-group-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateGroupModal {
  private readonly groupStore = inject(GroupStore);

  protected readonly colorHex = COLOR_HEX;
  protected readonly colors = COLORS;

  readonly created = output<{ groupId: string; groupName: string }>();
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly color = signal<GroupColor>('blue');
  protected readonly creating = signal(false);
  protected readonly error = signal<string | null>(null);

  setColor(color: GroupColor): void {
    this.color.set(color);
  }

  async create(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.creating()) return;

    this.creating.set(true);
    this.error.set(null);
    try {
      const group = await this.groupStore.createGroup(name, this.description().trim(), this.color());
      this.created.emit({ groupId: group.id, groupName: group.name });
      this.closed.emit();
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Không thể tạo nhóm mới. Vui lòng thử lại.');
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
