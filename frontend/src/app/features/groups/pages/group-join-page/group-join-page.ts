import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { GroupStore } from '../../data/group-store';
import { GroupApiService } from '../../services/group-api.service';
import { GROUP_COLOR_HEX, GroupColor, GroupInviteLinkPreview } from '../../models/group.models';

type PageState = 'loading' | 'invalid' | 'ready' | 'submitting' | 'submitted' | 'error';

/**
 * Đích của link mời nhóm ("/groups/join/:token"). Đứng sau authGuard nên khi
 * component này mount, người xem chắc chắn đã đăng nhập — chỉ còn phải hỏi
 * server xem token còn hiệu lực không và họ đã là thành viên/đã gửi yêu cầu
 * trước đó chưa.
 */
@Component({
  selector: 'app-group-join-page',
  templateUrl: './group-join-page.html',
  styleUrl: './group-join-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class GroupJoinPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(GroupStore);
  private readonly api = inject(GroupApiService);
  protected readonly i18n = inject(TranslationService);

  protected readonly state = signal<PageState>('loading');
  protected readonly preview = signal<GroupInviteLinkPreview | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  protected readonly groupColorHex = (color: string) =>
    GROUP_COLOR_HEX[color as GroupColor] ?? GROUP_COLOR_HEX['blue'];

  constructor() {
    void this.loadPreview();
  }

  private async loadPreview(): Promise<void> {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    try {
      const preview = await this.api.getInviteLinkPreview(this.token);
      this.preview.set(preview);
      this.state.set('ready');
    } catch {
      this.state.set('invalid');
    }
  }

  protected async requestToJoin(): Promise<void> {
    if (this.state() !== 'ready') return;
    this.state.set('submitting');
    this.errorMessage.set(null);
    try {
      await this.store.requestToJoinGroup(this.token);
      this.state.set('submitted');
    } catch (err: any) {
      this.errorMessage.set(err?.error?.message || this.i18n.t('group.joinPageSubmitError'));
      this.state.set('ready');
    }
  }

  protected goToGroup(): void {
    void this.router.navigate(['/calendar']);
  }
}
