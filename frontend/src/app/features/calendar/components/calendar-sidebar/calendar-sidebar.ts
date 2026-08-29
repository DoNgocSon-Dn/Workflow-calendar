import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CalendarStore, localizedCalendarName } from '../../data/calendar-store';
import { ScreenNotesService } from '../../data/screen-notes.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { GroupStore } from '../../../groups/data/group-store';
import { Group } from '../../../groups/models/group.models';
import { CALENDAR_COLOR_HEX, NOTE_COLOR_HEX, CalendarColor } from '../../models/calendar.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { MiniCalendar } from '../mini-calendar/mini-calendar';
import { resolveTopHolidayForDate } from '../../utils/holiday-resolver';
import { HolidayThemeService } from '../../data/holiday-theme.service';

/** Các đường dẫn SVG hạt hiệu ứng tối giản & tinh tế (Anti-slop) */
const PARTICLE_SVG_PATHS = {
  sparkle: 'M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z',
  star: 'M12 2l2.9 6.8 7.1.6-5.3 4.7 1.6 7-6.3-3.7-6.3 3.7 1.6-7-5.3-4.7 7.1-.6z',
  dot: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
  petal: 'M12 2C17 8 21 14 12 22C3 14 7 8 12 2Z',
  snowflake: 'M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
};

interface SidebarSvgParticle {
  readonly path: string;
  readonly color: string;
  readonly leftPercent: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
  readonly sizePx: number;
  readonly isStroke?: boolean;
}

/** Cùng một nhóm có thể về từ nhiều membership; sidebar chỉ hiện một dòng. */
function dedupeByName(groups: Group[]): Group[] {
  const seen = new Set<string>();
  const result: Group[] = [];
  for (const g of groups) {
    const key = g.name.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(g);
  }
  return result;
}

@Component({
  selector: 'app-calendar-sidebar',
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniCalendar, Icon],
  host: {
    '(document:click)': 'activeColorPickerId.set(null)',
  },
})
export class CalendarSidebar implements OnInit {
  protected readonly store = inject(CalendarStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly i18n = inject(TranslationService);
  protected readonly screenNotes = inject(ScreenNotesService);
  private readonly dialog = inject(DialogService);
  private readonly holidayThemeService = inject(HolidayThemeService);

  protected readonly colorHex = CALENDAR_COLOR_HEX;
  protected readonly noteColorHex = NOTE_COLOR_HEX;

  protected readonly activeColorPickerId = signal<string | null>(null);
  protected readonly availableColors: CalendarColor[] = [
    'blue',
    'green',
    'orange',
    'red',
    'purple',
    'teal',
  ];

  /**
   * Bật/tắt hiệu ứng icon rơi theo cài đặt "Giao diện & Hiệu ứng ngày lễ" trong Settings
   */
  protected readonly particlesEnabled = computed(() => this.holidayThemeService.mode() === 'auto');

  /**
   * Ngày lễ hiện tại: Ưu tiên ngày đang bấm xem trên lịch, hoặc ngày hôm nay
   */
  protected readonly activeHoliday = computed(() => {
    const focused = this.store.focusedDate();
    const holidayOnFocused = resolveTopHolidayForDate(focused);
    if (holidayOnFocused) return holidayOnFocused;
    return resolveTopHolidayForDate(this.store.today());
  });

  /**
   * Tạo các hạt hiệu ứng SVG Vector tinh tế & sang trọng thay cho Emoji hệ thống
   */
  protected readonly sidebarParticles = computed<readonly SidebarSvgParticle[]>(() => {
    const h = this.activeHoliday();
    if (!this.particlesEnabled() || !h) return [];

    const id = h.id.toLowerCase();

    let specs: Array<{ path: string; color: string; isStroke?: boolean }>;

    // Phân loại kiểu hạt SVG tinh tế theo chủ đề ngày lễ
    if (id.includes('christmas')) {
      specs = [
        { path: PARTICLE_SVG_PATHS.snowflake, color: '#38bdf8', isStroke: true },
        { path: PARTICLE_SVG_PATHS.sparkle, color: '#bae6fd' },
        { path: PARTICLE_SVG_PATHS.dot, color: '#e0f2fe' },
      ];
    } else if (id.includes('tet-nguyen-dan') || id.includes('tat-nien') || id.includes('women')) {
      specs = [
        { path: PARTICLE_SVG_PATHS.petal, color: '#fb7185' },
        { path: PARTICLE_SVG_PATHS.sparkle, color: '#fbbf24' },
        { path: PARTICLE_SVG_PATHS.dot, color: '#fda4af' },
      ];
    } else if (id.includes('valentine')) {
      specs = [
        { path: PARTICLE_SVG_PATHS.heart, color: '#f472b6' },
        { path: PARTICLE_SVG_PATHS.sparkle, color: '#fb7185' },
        { path: PARTICLE_SVG_PATHS.dot, color: '#fbcfe8' },
      ];
    } else {
      // Mặc định tinh tế cho tất cả các ngày lễ khác (Giỗ Tổ Hùng Vương, Quốc Khánh, 20/11, 27/2, v.v.)
      specs = [
        { path: PARTICLE_SVG_PATHS.sparkle, color: '#fbbf24' },
        { path: PARTICLE_SVG_PATHS.star, color: '#f59e0b' },
        { path: PARTICLE_SVG_PATHS.dot, color: '#fef08a' },
      ];
    }

    // Sinh 7 hạt hiệu ứng trôi siêu nhẹ nhàng & thanh lịch
    return Array.from({ length: 7 }, (_, i) => {
      const spec = specs[i % specs.length]!;
      return {
        path: spec.path,
        color: spec.color,
        isStroke: spec.isStroke,
        leftPercent: ((i * 13) + 7) % 86,
        delaySeconds: i * 1.9,
        durationSeconds: 16.0 + (i % 4) * 2.8,
        sizePx: 12 + (i % 3) * 3,
      };
    });
  });

  toggleColorPicker(event: Event, calendarId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeColorPickerId.update((curr) => (curr === calendarId ? null : calendarId));
  }

  async selectColor(event: Event, calendarId: string, color: CalendarColor): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.activeColorPickerId.set(null);
    try {
      await this.store.updateCalendarColor(calendarId, color);
    } catch {
      // Ignore
    }
  }

  readonly createClicked = output<void>();
  readonly createCalendarClicked = output<void>();
  readonly createGroupClicked = output<void>();
  readonly joinGroupClicked = output<void>();
  readonly notesTrashClicked = output<void>();
  readonly inviteClicked = output<{ calendarId: string; calendarName: string }>();

  protected readonly displayCalendars = this.store.calendars;
  protected readonly displayGroups = computed(() => dedupeByName(this.groupStore.visibleGroups()));
  protected readonly hiddenGroups = computed(() => dedupeByName(this.groupStore.hiddenGroups()));
  protected readonly hiddenSectionOpen = signal(false);

  private readonly groupCalendarIds = computed(
    () => new Set(this.groupStore.groups().map((g) => g.calendarId)),
  );

  protected readonly deletingCalendarId = signal<string | null>(null);

  protected isPersonalCalendar(calendarId: string): boolean {
    return !this.groupCalendarIds().has(calendarId);
  }

  protected canDeleteCalendar(cal: { id: string; canEdit: boolean }): boolean {
    return cal.canEdit && !this.groupCalendarIds().has(cal.id);
  }

  ngOnInit(): void {
    this.groupStore.loadGroups();
  }

  onDateSelected(date: Date): void {
    this.store.goTo(date);
  }

  isVisible(calendarId: string): boolean {
    return this.store.visibleCalendarIds().has(calendarId);
  }

  calendarLabel(cal: { name: string }): string {
    return localizedCalendarName(cal.name, (k) => this.i18n.t(k));
  }

  onInviteClicked(event: Event, calendarId: string, calendarName: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.inviteClicked.emit({ calendarId, calendarName });
  }

  async onDeleteCalendarClicked(event: Event, calendarId: string, calendarName: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this.deletingCalendarId()) return;

    const writableCount = this.store.calendars().filter((c) => c.canEdit).length;
    if (writableCount <= 1) {
      await this.dialog.alert(this.i18n.t('sidebar.needWritableCalendar'));
      return;
    }

    const ok = await this.dialog.confirm(
      this.i18n.t('sidebar.deleteCalendarBody', { name: calendarName }),
      {
        title: this.i18n.t('sidebar.deleteCalendarTitle', { name: calendarName }),
        confirmLabel: this.i18n.t('sidebar.deleteCalendarConfirm'),
        danger: true,
      },
    );
    if (!ok) return;

    this.deletingCalendarId.set(calendarId);
    try {
      await this.store.deleteCalendar(calendarId);
    } catch (err: unknown) {
      const body = (err as { error?: { message?: string } })?.error;
      await this.dialog.alert(body?.message || this.i18n.t('sidebar.deleteCalendarError'));
    } finally {
      this.deletingCalendarId.set(null);
    }
  }

  onGroupClicked(group: Group): void {
    this.groupStore.selectGroup(group);
  }

  toggleHiddenSection(): void {
    this.hiddenSectionOpen.update((open) => !open);
  }

  async onToggleGroupHidden(event: Event, group: Group): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    try {
      await this.groupStore.setGroupHidden(group.id, !group.hidden);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.groupVisibilityError'));
    }
  }

  protected readonly deletingNoteId = signal<string | null>(null);
  protected readonly creatingNote = signal(false);

  protected readonly visibleNotes = computed(() =>
    this.store.notes().filter((n) => !this.screenNotes.pinnedIds().has(n.id)),
  );

  async onCreateNoteClicked(): Promise<void> {
    if (this.creatingNote()) return;
    const content = await this.dialog.prompt(this.i18n.t('sidebar.createNotePrompt'));
    const trimmed = content?.trim();
    if (!trimmed) return;

    this.creatingNote.set(true);
    try {
      const palette = Object.keys(NOTE_COLOR_HEX);
      const color = palette[Math.floor(Math.random() * palette.length)] ?? 'yellow';
      const note = await this.store.createNote(trimmed, color);
      this.screenNotes.pin(note.id);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.createNoteError'));
    } finally {
      this.creatingNote.set(false);
    }
  }

  async onDeleteNoteClicked(event: Event, noteId: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this.deletingNoteId()) return;

    const ok = await this.dialog.confirm(this.i18n.t('note.deleteBody'), {
      title: this.i18n.t('sidebar.deleteNoteTitle'),
      confirmLabel: this.i18n.t('sidebar.deleteNoteConfirm'),
      danger: true,
    });
    if (!ok) return;

    this.deletingNoteId.set(noteId);
    try {
      await this.store.deleteNote(noteId);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.deleteNoteError'));
    } finally {
      this.deletingNoteId.set(null);
    }
  }

  onNotesTrashClicked(): void {
    this.notesTrashClicked.emit();
  }

  onToggleScreenPin(event: Event, noteId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.screenNotes.toggle(noteId);
  }

  onNoteDragStart(event: DragEvent, noteId: string): void {
    event.dataTransfer?.setData('application/x-note-id', noteId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
}
