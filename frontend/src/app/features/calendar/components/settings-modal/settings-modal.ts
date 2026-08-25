import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Density, DensityService } from '../../../../core/density/density-service';
import { Locale, TranslationService } from '../../../../core/i18n/translation.service';
import { HolidayPopupService } from '../../../../core/services/holiday-popup.service';
import { BirthdayPopupService } from '../../../../core/services/birthday-popup.service';
import { NotificationSoundService } from '../../../../core/services/notification-sound.service';
import { TimeFormatService } from '../../../../core/time-format/time-format-service';
import { TimeFormat, dateInputValue } from '../../utils/date-utils';
import { BrandTheme, BrandThemeService } from '../../../../core/theme/brand-theme-service';
import { Theme, ThemeService } from '../../../../core/theme/theme-service';
import { HolidayThemeMode, HolidayThemeService } from '../../data/holiday-theme.service';
import { HOLIDAYS } from '../../../../data/holidays.data';

interface BrandThemeOption {
  readonly value: BrandTheme;
  readonly labelKey: string;
  readonly swatch: string;
}

const BRAND_THEME_OPTIONS: readonly BrandThemeOption[] = [
  { value: 'default', labelKey: 'settings.brandDefault', swatch: '#2563eb' },
  { value: 'teal', labelKey: 'settings.brandTeal', swatch: '#0f766e' },
  { value: 'violet', labelKey: 'settings.brandViolet', swatch: '#7c3aed' },
];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

type SettingsSection = 'profile' | 'appearance' | 'language' | 'notifications' | 'other';

interface SettingsNavItem {
  readonly id: SettingsSection;
  readonly labelKey: string;
}

const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  { id: 'profile', labelKey: 'settings.sectionProfile' },
  { id: 'appearance', labelKey: 'settings.sectionAppearance' },
  { id: 'language', labelKey: 'settings.sectionLanguage' },
  { id: 'notifications', labelKey: 'settings.sectionNotifications' },
  { id: 'other', labelKey: 'settings.sectionOther' },
];

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
  protected readonly timeFormatService = inject(TimeFormatService);
  protected readonly holidayPopupService = inject(HolidayPopupService);
  protected readonly holidayThemeService = inject(HolidayThemeService);
  protected readonly soundService = inject(NotificationSoundService);
  protected readonly birthdayPopupService = inject(BirthdayPopupService);
  protected readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);

  protected readonly brandThemeOptions = BRAND_THEME_OPTIONS;
  protected readonly navItems = SETTINGS_NAV_ITEMS;
  protected readonly activeSection = signal<SettingsSection>('profile');

  readonly closed = output<void>();
  readonly openTrash = output<void>();

  protected readonly nameDraft = signal(this.authStore.displayName() ?? '');
  protected readonly savingName = signal(false);
  protected readonly nameSaved = signal(false);
  protected readonly dobDraft = signal(this.birthdayPopupService.getUserDob() ?? '');
  protected readonly maxDob = dateInputValue(new Date());
  protected readonly formattedDob = computed(() => this.birthdayPopupService.getFormattedDobDisplay());
  protected readonly editingDob = signal(false);
  protected readonly savingDob = signal(false);
  protected readonly dobSaved = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly profileError = signal<string | null>(null);

  protected readonly monthsOptions = [
    { value: 1, label: 'Tháng 1' },
    { value: 2, label: 'Tháng 2' },
    { value: 3, label: 'Tháng 3' },
    { value: 4, label: 'Tháng 4' },
    { value: 5, label: 'Tháng 5' },
    { value: 6, label: 'Tháng 6' },
    { value: 7, label: 'Tháng 7' },
    { value: 8, label: 'Tháng 8' },
    { value: 9, label: 'Tháng 9' },
    { value: 10, label: 'Tháng 10' },
    { value: 11, label: 'Tháng 11' },
    { value: 12, label: 'Tháng 12' },
  ];

  protected readonly yearsOptions = Array.from(
    { length: new Date().getFullYear() - 1920 + 1 },
    (_, i) => new Date().getFullYear() - i
  );

  protected readonly selectedDobDay = computed(() => {
    const parts = (this.dobDraft() || '').split('-');
    return parts.length === 3 ? parseInt(parts[2], 10) || 1 : 1;
  });

  protected readonly selectedDobMonth = computed(() => {
    const parts = (this.dobDraft() || '').split('-');
    return parts.length === 3 ? parseInt(parts[1], 10) || 1 : 1;
  });

  protected readonly selectedDobYear = computed(() => {
    const parts = (this.dobDraft() || '').split('-');
    return parts.length === 3 ? parseInt(parts[0], 10) || 2000 : 2000;
  });

  protected readonly daysOptions = computed(() => {
    const m = this.selectedDobMonth();
    const y = this.selectedDobYear();
    const daysInMonth = new Date(y, m, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  });

  protected readonly formattedDobDraft = computed(() => {
    const parts = (this.dobDraft() || '').split('-');
    if (parts.length === 3) {
      const d = parseInt(parts[2], 10);
      const m = parseInt(parts[1], 10);
      const y = parts[0];
      return `${parts[2]}/${parts[1]}/${y} (Ngày ${d} tháng ${m} năm ${y})`;
    }
    return this.dobDraft();
  });

  onDobDayChange(val: string | number): void {
    const d = parseInt(String(val), 10) || 1;
    this.updateDobDraft(this.selectedDobYear(), this.selectedDobMonth(), d);
  }

  onDobMonthChange(val: string | number): void {
    const m = parseInt(String(val), 10) || 1;
    const y = this.selectedDobYear();
    let d = this.selectedDobDay();
    const maxD = new Date(y, m, 0).getDate();
    if (d > maxD) d = maxD;
    this.updateDobDraft(y, m, d);
  }

  onDobYearChange(val: string | number): void {
    const y = parseInt(String(val), 10) || 2000;
    const m = this.selectedDobMonth();
    let d = this.selectedDobDay();
    const maxD = new Date(y, m, 0).getDate();
    if (d > maxD) d = maxD;
    this.updateDobDraft(y, m, d);
  }

  private updateDobDraft(year: number, month: number, day: number): void {
    const yStr = String(year);
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    this.dobDraft.set(`${yStr}-${mStr}-${dStr}`);
  }

  async saveDob(): Promise<void> {
    const dob = this.dobDraft().trim();
    if (this.savingDob()) return;
    this.savingDob.set(true);
    await this.birthdayPopupService.setUserDob(dob);
    this.savingDob.set(false);
    this.dobSaved.set(true);
    setTimeout(() => this.dobSaved.set(false), 2500);
  }

  testBirthdayPopup(): void {
    this.birthdayPopupService.triggerBirthday(this.dobDraft() || undefined, true);
  }

  setTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  setBrandTheme(theme: BrandTheme): void {
    this.brandThemeService.setBrandTheme(theme);
  }

  setDensity(density: Density): void {
    this.densityService.setDensity(density);
  }

  setTimeFormat(format: TimeFormat): void {
    this.timeFormatService.setFormat(format);
  }

  setLocale(locale: Locale): void {
    this.i18n.setLocale(locale);
  }

  toggleHolidayNotifications(): void {
    this.holidayPopupService.setNotificationsEnabled(!this.holidayPopupService.notificationsEnabled());
  }

  setHolidayThemeMode(mode: HolidayThemeMode): void {
    this.holidayThemeService.setMode(mode);
  }

  onHolidayDebugChange(value: string): void {
    this.holidayThemeService.setDebugOverride(value || null);
  }

  toggleNotificationSound(): void {
    this.soundService.toggle();
  }

  previewNotificationSound(): void {
    void this.soundService.preview();
  }

  previewChatSound(): void {
    void this.soundService.preview('chat');
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

  openTrashFromSettings(): void {
    this.closed.emit();
    this.openTrash.emit();
  }

  print(): void {
    this.closed.emit();
    window.print();
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
