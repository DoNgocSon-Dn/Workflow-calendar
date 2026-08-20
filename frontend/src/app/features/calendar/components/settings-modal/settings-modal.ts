import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Density, DensityService } from '../../../../core/density/density-service';
import { Theme, ThemeService } from '../../../../core/theme/theme-service';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.html',
  styleUrl: './settings-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModal {
  protected readonly themeService = inject(ThemeService);
  protected readonly densityService = inject(DensityService);
  protected readonly authStore = inject(AuthStore);

  readonly closed = output<void>();

  protected readonly nameDraft = signal(this.authStore.displayName() ?? '');
  protected readonly savingName = signal(false);
  protected readonly nameSaved = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly profileError = signal<string | null>(null);

  setTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  setDensity(density: Density): void {
    this.densityService.setDensity(density);
  }

  onNameInput(value: string): void {
    this.nameDraft.set(value);
    this.nameSaved.set(false);
  }

  async saveName(): Promise<void> {
    const name = this.nameDraft().trim();
    if (!name || this.savingName()) return;

    this.savingName.set(true);
    this.profileError.set(null);
    const error = await this.authStore.updateDisplayName(name);
    this.savingName.set(false);

    if (error) {
      this.profileError.set('Không thể lưu tên. Vui lòng thử lại.');
      return;
    }
    this.nameSaved.set(true);
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.profileError.set('Vui lòng chọn một tệp hình ảnh.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.profileError.set('Ảnh quá lớn (tối đa 5MB).');
      return;
    }

    this.uploadingAvatar.set(true);
    this.profileError.set(null);
    const result = await this.authStore.uploadAvatar(file);
    this.uploadingAvatar.set(false);

    if (typeof result !== 'string') {
      this.profileError.set('Không thể tải ảnh lên. Vui lòng thử lại.');
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
