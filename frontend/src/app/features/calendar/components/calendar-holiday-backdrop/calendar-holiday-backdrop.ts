import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HolidayPopupService } from '../../../../core/services/holiday-popup.service';
import { HolidayArchetype } from '../../../../models/holiday-theme.model';
import { TetBranchMotif } from '../../../../shared/components/holiday-popup/tet-branch-motif';
import { LaborDayMotif } from '../../../../shared/components/holiday-popup/labor-day-motif';
import { NationalDayMotif } from '../../../../shared/components/holiday-popup/national-day-motif';
import { VietnamFlagMotif } from '../../../../shared/components/holiday-popup/vietnam-flag-motif';
import { DongSonDrumMotif } from '../../../../shared/components/holiday-popup/dong-son-drum-motif';
import { NewYearMotif } from '../../../../shared/components/holiday-popup/new-year-motif';
import { HolidayParallax } from '../../../../shared/directives/holiday-parallax';

/**
 * Danh sách các ngày có Holiday 3D Scene thật sự lên nền cả vùng lịch — mọi
 * "lễ lớn" (`officialHoliday: true` trong `holidays.data.ts`) đã có nghệ
 * thuật riêng dạng `*-scene`: Tết, 1/5, 2/9, 30/4 (cờ + Dinh Độc Lập + chim bồ
 * câu), Giỗ Tổ (trống đồng Đông Sơn), Tết Dương Lịch (đồng hồ giao thừa +
 * pháo hoa). Chỉ cần thêm archetype vào đây — không cần đổi gì trong
 * `HOLIDAYS` — để bật/tắt 3D Scene cho một lễ. Không tự ý thêm holiday khác
 * ngoài danh sách "lễ lớn" chính thức vào đây. */
const SCENE_ARCHETYPES = new Set<HolidayArchetype>([
  'tet-branch-scene',
  'labor-day-scene',
  'national-day-scene',
  'vietnam-flag-scene',
  'dong-son-drum-scene',
  'new-year-scene',
]);

/**
 * Lớp cảnh động NẰM SAU khu vực lịch (`.view-area`), không phải banner góc
 * hay panel sidebar — chỉ những "lễ lớn" đã có nghệ thuật riêng
 * (`composition.archetype` dạng `*-scene`, và nằm trong `SCENE_ARCHETYPES`)
 * mới được vẽ ở đây, và chỉ khi lễ đó đang thực sự diễn ra hôm nay
 * (`activeHoliday`, không phụ thuộc việc popup chúc mừng đã bị đóng hay
 * chưa — nền vẫn ở lại suốt kỳ lễ).
 */
@Component({
  selector: 'app-calendar-holiday-backdrop',
  templateUrl: './calendar-holiday-backdrop.html',
  styleUrl: './calendar-holiday-backdrop.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TetBranchMotif,
    LaborDayMotif,
    NationalDayMotif,
    VietnamFlagMotif,
    DongSonDrumMotif,
    NewYearMotif,
    HolidayParallax,
  ],
})
export class CalendarHolidayBackdrop {
  private readonly holidayPopupService = inject(HolidayPopupService);

  protected readonly activeScene = computed<HolidayArchetype | null>(() => {
    const archetype = this.holidayPopupService.activeHoliday()?.theme?.composition.archetype;
    return archetype && SCENE_ARCHETYPES.has(archetype) ? archetype : null;
  });
}
