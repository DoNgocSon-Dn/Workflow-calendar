import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GroupStore } from '../../data/group-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { extractHttpErrorMessage } from '../../../../shared/utils/error-extractor';

@Component({
  selector: 'app-join-group-modal',
  templateUrl: './join-group-modal.html',
  styleUrl: './join-group-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class JoinGroupModal {
  private readonly groupStore = inject(GroupStore);
  protected readonly i18n = inject(TranslationService);

  /** Nhóm vừa vào — mở workspace luôn cho tiện. */
  readonly joined = output<{ groupId: string; groupName: string }>();
  readonly closed = output<void>();

  protected readonly code = signal('');
  protected readonly joining = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Sau khi gửi yêu cầu ở nhóm cần duyệt. */
  protected readonly pending = signal(false);

  onCodeInput(value: string): void {
    // Mã chỉ gồm chữ + số, luôn viết hoa để người dùng khỏi băn khoăn hoa/thường.
    this.code.set(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
    this.error.set(null);
  }

  async submit(): Promise<void> {
    const code = this.code().trim();
    if (code.length < 4 || this.joining()) return;

    this.joining.set(true);
    this.error.set(null);
    try {
      const res = await this.groupStore.joinByCode(code);
      if (res.status === 'joined') {
        this.joined.emit({ groupId: res.group.id, groupName: res.group.name });
        this.closed.emit();
      } else {
        this.pending.set(true);
      }
    } catch (err) {
      this.error.set(
        extractHttpErrorMessage(
          err,
          this.i18n.t('joinGroup.error'),
          this.i18n.t('joinGroup.networkError'),
        ),
      );
    } finally {
      this.joining.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
