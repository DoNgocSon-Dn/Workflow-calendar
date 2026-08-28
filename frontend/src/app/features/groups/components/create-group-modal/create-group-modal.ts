import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GroupStore } from '../../data/group-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { GROUP_COLOR_HEX, GROUP_COLORS, GroupColor } from '../../models/group.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { CharCounter } from '../../../../shared/components/char-counter/char-counter';

import { extractHttpErrorMessage } from '../../../../shared/utils/error-extractor';

function extractErrorMessage(err: unknown, i18n: TranslationService): string {
  return extractHttpErrorMessage(err, i18n.t('createGroup.error'), i18n.t('createGroup.networkError'));
}

@Component({
  selector: 'app-create-group-modal',
  templateUrl: './create-group-modal.html',
  styleUrl: './create-group-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, CharCounter],
})
export class CreateGroupModal {
  private readonly groupStore = inject(GroupStore);
  protected readonly i18n = inject(TranslationService);

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
      this.error.set(extractErrorMessage(err, this.i18n));
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
