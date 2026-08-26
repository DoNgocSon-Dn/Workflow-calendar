import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HolidayPopupService } from '../../../../core/services/holiday-popup.service';
import { HolidayArchetype } from '../../../../models/holiday-theme.model';
import { TetBranchMotif } from '../../../../shared/components/holiday-popup/tet-branch-motif';
import { DongSonDrumMotif } from '../../../../shared/components/holiday-popup/dong-son-drum-motif';
import { VietnamFlagMotif } from '../../../../shared/components/holiday-popup/vietnam-flag-motif';

/** Chỉ những archetype có scene 3D thật sự (kiểu "*-scene") mới được vẽ ở
 *  đây — các archetype icon-nhỏ dùng cho popup (star-emblem, tree-scene cũ,
 *  geometric-abstract...) không đủ chất liệu để làm nền cả vùng lịch, nên
 *  không liệt kê ở đây thì mặc định không có nền (ngày thường/lễ nhỏ). */
const SCENE_ARCHETYPES = new Set<HolidayArchetype>([
  'tet-branch-scene',
  'dong-son-drum-scene',
  'vietnam-flag-scene',
]);

/**
 * Lớp cảnh động NẰM SAU khu vực lịch (`.view-area`), không phải banner góc
 * hay panel sidebar — chỉ những "lễ lớn" đã có nghệ thuật riêng
 * (`composition.archetype` dạng `*-scene`) mới được vẽ ở đây, và chỉ khi lễ
 * đó đang thực sự diễn ra hôm nay (`activeHoliday`, không phụ thuộc việc
 * popup chúc mừng đã bị đóng hay chưa — nền vẫn ở lại suốt kỳ lễ).
 */
@Component({
  selector: 'app-calendar-holiday-backdrop',
  templateUrl: './calendar-holiday-backdrop.html',
  styleUrl: './calendar-holiday-backdrop.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TetBranchMotif, DongSonDrumMotif, VietnamFlagMotif],
})
export class CalendarHolidayBackdrop {
  private readonly holidayPopupService = inject(HolidayPopupService);

  protected readonly activeScene = computed<HolidayArchetype | null>(() => {
    const archetype = this.holidayPopupService.activeHoliday()?.theme?.composition.archetype;
    return archetype && SCENE_ARCHETYPES.has(archetype) ? archetype : null;
  });
}
