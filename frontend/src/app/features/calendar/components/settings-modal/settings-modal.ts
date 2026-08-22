import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Density, DensityService } from '../../../../core/density/density-service';
import { BrandTheme, BrandThemeService } from '../../../../core/theme/brand-theme-service';
import { Theme, ThemeService } from '../../../../core/theme/theme-service';

interface BrandThemeOption {
  readonly value: BrandTheme;
  readonly label: string;
  readonly swatch: string;
}

const BRAND_THEME_OPTIONS: readonly BrandThemeOption[] = [
  { value: 'default', label: 'Mặc định', swatch: '#6366f1' },
  { value: 'airbnb', label: 'Airbnb', swatch: '#ff385c' },
  { value: 'mintlify', label: 'Mintlify', swatch: '#00d4a4' },
  { value: 'supabase', label: 'Supabase', swatch: '#3ecf8e' },
  { value: 'vercel', label: 'Vercel', swatch: '#0070f3' },
];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.html',
  styleUrl: './settings-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModal {
  protected readonly themeService = inject(ThemeService);
  protected readonly brandThemeService = inject(BrandThemeService);
  protected readonly densityService = inject(DensityService);
  protected readonly authStore = inject(AuthStore);

  protected readonly brandThemeOptions = BRAND_THEME_OPTIONS;

  readonly closed = output<void>();

  protected readonly nameDraft = signal(this.authStore.displayName() ?? '');
  protected readonly savingName = signal(false);
  protected readonly nameSaved = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly profileError = signal<string | null>(null);

  setTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  setBrandTheme(theme: BrandTheme): void {
    this.brandThemeService.setBrandTheme(theme);
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
