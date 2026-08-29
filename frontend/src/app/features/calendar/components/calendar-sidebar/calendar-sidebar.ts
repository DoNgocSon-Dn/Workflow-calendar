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

interface SidebarParticle {
  readonly emoji: string;
  readonly leftPercent: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
  readonly sizePx: number;
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
   * Tra cứu bộ Icon rơi tương ứng cho TẤT CẢ các ngày lễ trong năm (~45 ngày lễ)
   */
  protected readonly holidayEmojis = computed<readonly string[]>(() => {
    const h = this.activeHoliday();
    if (!h) return [];
    const themeEmojis = h.theme?.decoration?.particleEmoji;
    if (themeEmojis && themeEmojis.length > 0) return themeEmojis;

    const id = h.id.toLowerCase();

    // Tết & Lễ Âm lịch
    if (id.includes('tet-nguyen-dan') || id.includes('tat-nien')) return ['🌸', '✨', '🧧', '🌼'];
    if (id.includes('tao-quan')) return ['🐟', '✨', '🏮'];
    if (id.includes('than-tai')) return ['💰', '✨', '🏮', '🪙'];
    if (id.includes('nguyen-tieu')) return ['🏮', '🌕', '✨'];
    if (id.includes('han-thuc')) return ['🍡', '✨'];
    if (id.includes('hung-kings')) return ['🥁', '⭐', '✨'];
    if (id.includes('vesak')) return ['🪷', '🕯️', '✨'];
    if (id.includes('doan-ngo')) return ['🥭', '🌿', '✨'];
    if (id.includes('vu-lan')) return ['🪷', '💖', '✨'];
    if (id.includes('mid-autumn')) return ['🌕', '🏮', '⭐', '🥮'];

    // Lễ Quốc gia & Lịch sử Việt Nam
    if (
      id.includes('national') ||
      id.includes('reunification') ||
      id.includes('august') ||
      id.includes('dien-bien') ||
      id.includes('hanoi')
    ) {
      return ['⭐', '🎆', '🇻🇳', '🎉'];
    }
    if (id.includes('army')) return ['⭐', '🎖️', '✨'];
    if (id.includes('party')) return ['⭐', '🚩', '✨'];

    // Ngày Ngành Nghề & Kỷ Niệm
    if (id.includes('teacher')) return ['📚', '✏️', '🌻'];
    if (id.includes('doctor')) return ['🩺', '💊', '💖'];
    if (id.includes('press')) return ['📰', '✒️', '✨'];
    if (id.includes('entrepreneur')) return ['💼', '🤝', '✨'];
    if (id.includes('family')) return ['🏡', '❤️', '👨‍👩‍👧‍👦'];
    if (id.includes('women')) return ['🌷', '🌸', '💐'];
    if (id.includes('children')) return ['🎈', '🎉', '🧸'];
    if (id.includes('student') || id.includes('youth') || id.includes('team')) return ['🎓', '📚', '✨', '🚩'];
    if (id.includes('book')) return ['📖', '📚', '✨'];
    if (id.includes('invalids')) return ['🕯️', '🌹', '⭐'];

    // Quốc tế & Lễ hội
    if (id.includes('christmas')) return ['❄️', '🎄', '✨', '🎁'];
    if (id.includes('new-year')) return ['🎆', '🥂', '🎉', '✨'];
    if (id.includes('halloween')) return ['🎃', '👻', '🕸️', '🦇'];
    if (id.includes('valentine')) return ['❤️', '💕', '💖', '🌹'];
    if (id.includes('april-fools')) return ['🤡', '🎈', '✨'];
    if (id.includes('labor')) return ['🛠️', '✨', '🎉'];

    return ['✨', '⭐', '🎉', '🌟'];
  });

  protected readonly sidebarParticles = computed<readonly SidebarParticle[]>(() => {
    const emojis = this.holidayEmojis();
    if (!this.particlesEnabled() || emojis.length === 0) return [];

    return Array.from({ length: 22 }, (_, i) => ({
      emoji: emojis[i % emojis.length],
      leftPercent: (i * 137.5) % 94,
      delaySeconds: (i % 6) * 0.4,
      durationSeconds: 5.5 + (i % 5) * 0.9,
      sizePx: 14 + (i % 5) * 3,
    }));
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
