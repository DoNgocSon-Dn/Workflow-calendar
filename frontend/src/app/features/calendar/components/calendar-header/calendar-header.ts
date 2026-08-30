import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent, CalendarViewMode } from '../../models/calendar.models';
import { addDays, monthYearLabel, startOfWeek } from '../../utils/date-utils';
import { NotificationButton } from '../../../../shared/components/notification/notification-button';
import { OpenGroupChatRequest } from '../../../../shared/components/notification/notification-panel';
import { BrandLogo } from '../../../../shared/components/brand-logo/brand-logo';
import { Icon } from '../../../../shared/components/icon/icon';
import { OverflowTooltip } from '../../../../shared/directives/overflow-tooltip';

/** Matches calendar-page.css / calendar-sidebar.css's mobile-drawer breakpoint. */
const MOBILE_BREAKPOINT_PX = 720;

const DATE_FMT: Record<'vi' | 'en', { dayMonth: Intl.DateTimeFormat; fullDate: Intl.DateTimeFormat }> = {
  vi: {
    dayMonth: new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short' }),
    fullDate: new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  },
  en: {
    dayMonth: new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }),
    fullDate: new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  },
};

@Component({
  selector: 'app-calendar-header',
  templateUrl: './calendar-header.html',
  styleUrl: './calendar-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotificationButton, BrandLogo, Icon, RouterLink, OverflowTooltip],
})
export class CalendarHeader {
  protected readonly store = inject(CalendarStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  readonly openImport = output<void>();
  readonly openSettings = output<void>();
  readonly openEventFromNotification = output<string>();
  readonly openGroupFromNotification = output<OpenGroupChatRequest>();

  protected readonly userEmail = computed(() => this.authStore.user()?.email ?? '');
  protected readonly displayName = computed(() => this.authStore.displayName() ?? this.userEmail());
  protected readonly avatarUrl = computed(() => this.authStore.avatarUrl());
  protected readonly userInitial = computed(() => this.displayName().charAt(0).toUpperCase() || '?');
  protected readonly userMenuOpen = signal(false);
  protected readonly viewMenuOpen = signal(false);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  /** Only open while the input has focus AND there's something to search —
   *  closing on blur is deferred (see `selectSearchResult`) so a click on a
   *  result registers before the blur would otherwise dismiss the list. */
  protected readonly searchFocused = signal(false);
  protected readonly searchResultsOpen = computed(
    () => this.searchFocused() && this.store.searchQuery().trim().length > 0,
  );
  protected readonly searchResults = computed(() => this.store.searchResults());

  /** Điện thoại: ô tìm kiếm inline không có chỗ trên thanh trên, nên thay bằng
   *  một nút 🔍 mở lớp phủ tìm kiếm toàn màn. Kết quả vẫn là `searchResults()`. */
  protected readonly searchOverlayOpen = signal(false);
  protected readonly searchOverlayHasQuery = computed(
    () => this.store.searchQuery().trim().length > 0,
  );
  private readonly searchOverlayInput =
    viewChild<ElementRef<HTMLInputElement>>('searchOverlayInput');

  constructor() {
    // Mở lớp phủ tìm kiếm thì đưa con trỏ vào ô nhập ngay (autofocus không đáng
    // tin với phần tử render qua @if).
    effect(() => {
      if (this.searchOverlayOpen()) {
        queueMicrotask(() => this.searchOverlayInput()?.nativeElement.focus());
      }
    });
  }

  openSearchOverlay(): void {
    this.searchOverlayOpen.set(true);
  }

  closeSearchOverlay(): void {
    this.searchOverlayOpen.set(false);
    this.store.clearSearch();
  }

  readonly viewModes: { mode: CalendarViewMode; labelKey: string }[] = [
    { mode: 'day', labelKey: 'header.viewDay' },
    { mode: '3day', labelKey: 'header.view3Day' },
    { mode: 'week', labelKey: 'header.viewWeek' },
    { mode: 'month', labelKey: 'header.viewMonth' },
    { mode: 'agenda', labelKey: 'header.viewAgenda' },
  ];

  readonly currentViewLabel = computed(() => {
    const key = this.viewModes.find((v) => v.mode === this.store.viewMode())?.labelKey;
    return key ? this.i18n.t(key) : '';
  });

  readonly periodLabel = computed(() => {
    const mode = this.store.viewMode();
    const focused = this.store.focusedDate();
    const locale = this.i18n.locale();
    const fmt = DATE_FMT[locale];
    if (mode === 'month') return monthYearLabel(focused, locale);
    if (mode === 'day') return fmt.fullDate.format(focused);

    if (mode === '3day') {
      const end3 = addDays(focused, 2);
      return `${fmt.dayMonth.format(focused)} – ${fmt.dayMonth.format(end3)}, ${end3.getFullYear()}`;
    }

    const start = startOfWeek(focused);
    const end = addDays(start, 6);
    return `${fmt.dayMonth.format(start)} – ${fmt.dayMonth.format(end)}, ${end.getFullYear()}`;
  });

  /** Nhãn kỳ RÚT GỌN cho thanh trên điện thoại — bỏ thứ + năm cho đỡ chật.
   *  "Chủ Nhật, 30 Tháng 8, 2026" → "30 Thg 8" · "Tháng 8 2026" giữ nguyên. */
  readonly periodLabelShort = computed(() => {
    const mode = this.store.viewMode();
    const focused = this.store.focusedDate();
    const locale = this.i18n.locale();
    const fmt = DATE_FMT[locale];
    if (mode === 'month') return monthYearLabel(focused, locale);
    if (mode === 'day' || mode === 'agenda') return fmt.dayMonth.format(focused);
    if (mode === '3day') {
      return `${fmt.dayMonth.format(focused)} – ${fmt.dayMonth.format(addDays(focused, 2))}`;
    }
    const start = startOfWeek(focused);
    return `${fmt.dayMonth.format(start)} – ${fmt.dayMonth.format(addDays(start, 6))}`;
  });

  /** Menu ⋮ trên điện thoại — gom Tìm kiếm / Nhập / Cài đặt / chuyển Tasks. */
  protected readonly moreMenuOpen = signal(false);
  toggleMoreMenu(): void {
    this.moreMenuOpen.update((o) => !o);
  }
  closeMoreMenu(): void {
    this.moreMenuOpen.set(false);
  }
  goToTasks(): void {
    this.closeMoreMenu();
    void this.router.navigate(['/tasks']);
  }

  /** One control that does the useful thing per screen size: on mobile the
   *  sidebar is an overlay drawer, so it must fully show/hide; on desktop
   *  there's room to keep an icon rail, so it collapses instead of vanishing. */
  toggleSidebar(): void {
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
      this.store.toggleSidebar();
    } else {
      this.store.toggleSidebarCollapsed();
    }
  }

  setViewMode(mode: CalendarViewMode): void {
    this.store.setViewMode(mode);
    this.viewMenuOpen.set(false);
  }

  toggleViewMenu(): void {
    this.viewMenuOpen.update((open) => !open);
  }

  closeViewMenu(): void {
    this.viewMenuOpen.set(false);
  }

  onNotificationOpenEvent(eventId: string): void {
    this.openEventFromNotification.emit(eventId);
  }

  onNotificationOpenGroup(request: OpenGroupChatRequest): void {
    this.openGroupFromNotification.emit(request);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  async logout(): Promise<void> {
    this.closeUserMenu();
    await this.authStore.signOut();
    // Về LANDING, không về /login. Đăng xuất là "tôi xong việc rồi", nên
    // điểm đến đúng là trang giới thiệu — nơi còn nút đăng nhập nếu họ đổi ý.
    // Đẩy thẳng vào /login là ngầm bảo "đăng nhập lại đi", trong khi họ vừa
    // chủ động thoát ra.
    //
    // authGuard vẫn giữ /login cho trường hợp KHÁC hẳn: vào thẳng /calendar
    // khi chưa có phiên. Lúc đó người dùng đang MUỐN vào, chỉ thiếu đăng
    // nhập — đưa họ tới đúng chỗ cần là hợp lý.
    await this.router.navigate(['/landing']);
  }

  protected searchResultDateLabel(event: CalendarEvent): string {
    return DATE_FMT[this.i18n.locale()].dayMonth.format(event.start);
  }

  /** mousedown fires before the input's blur, so the click registers here
   *  first; closing on blur alone would remove the dropdown (and the item
   *  under the pointer) before a click event ever reaches it. Just jumps the
   *  calendar to the event's date — no modal, the grid itself is the result. */
  selectSearchResult(event: CalendarEvent): void {
    this.store.goTo(event.start);
    // Xoa NGAY, khong cho debounce: nguoi dung da chon xong.
    this.store.clearSearch();
    this.searchFocused.set(false);
    this.searchOverlayOpen.set(false);
  }

  onSearchBlur(): void {
    this.searchFocused.set(false);
  }
}
