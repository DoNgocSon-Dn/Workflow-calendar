import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { GroupStore } from '../../data/group-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Group } from '../../models/group.models';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-forward-target-modal',
  templateUrl: './forward-target-modal.html',
  styleUrl: './forward-target-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class ForwardTargetModal {
  private readonly groupStore = inject(GroupStore);
  protected readonly i18n = inject(TranslationService);

  /** Nhóm đang mở — loại khỏi danh sách đích. */
  readonly excludeGroupId = input<string | null>(null);

  readonly picked = output<Group>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly sending = signal(false);

  protected readonly targets = computed(() => {
    const q = this.query().trim().toLowerCase();
    const exclude = this.excludeGroupId();
    return this.groupStore
      .groups()
      .filter((g) => g.id !== exclude)
      .filter((g) => !q || g.name.toLowerCase().includes(q));
  });

  choose(g: Group): void {
    if (this.sending()) return;
    this.sending.set(true);
    this.picked.emit(g);
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
