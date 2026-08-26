import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Cành mai/đào + lì xì đong đưa cho Tết Nguyên Đán — SVG thuần, dùng chung
 * giữa popup chúc mừng năm mới (`HolidayVisual`) và lớp nền động sau lịch
 * (`CalendarHolidayBackdrop`), để hai chỗ không lệch nhau khi chỉnh sửa.
 * Không nhận input: luôn vẽ y hệt một cảnh, nơi gọi tự quyết định kích
 * thước/vị trí/opacity qua CSS trên `:host`.
 */
@Component({
  selector: 'app-tet-branch-motif',
  templateUrl: './tet-branch-motif.html',
  styleUrl: './tet-branch-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TetBranchMotif {}
