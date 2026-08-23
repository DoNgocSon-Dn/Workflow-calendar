import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GroupStore } from '../../data/group-store';
import { GROUP_COLOR_HEX, GROUP_COLORS, GroupColor } from '../../models/group.models';
import { Icon } from '../../../../shared/components/icon/icon';

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
  return 'Không thể tạo nhóm mới. Vui lòng thử lại.';
}

@Component({
  selector: 'app-create-group-modal',
  templateUrl: './create-group-modal.html',
  styleUrl: './create-group-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class CreateGroupModal {
  private readonly groupStore = inject(GroupStore);

  protected readonly colorHex = GROUP_COLOR_HEX;
  protected readonly colors = GROUP_COLORS;

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
    } catch (err) {
      this.error.set(extractErrorMessage(err));
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
