import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Đồng hồ chỉ đúng 12h — kim giờ/phút chồng thẳng đứng, KHÔNG chạy (đứng
 *  yên, chỉ có quầng sáng nhẹ ở mốc 12 pulse) — khoảnh khắc giao thừa, không
 *  phải đồng hồ thật đang chạy. */
const CLOCK_CX = 148;
const CLOCK_CY = 44;
const CLOCK_R = 30;

/** Góc 12 vạch giờ quanh mặt đồng hồ. */
const CLOCK_TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

/** 8 tia của một vụ pháo hoa, dùng chung hình cho cả 3 quả (scale khác nhau
 *  qua group cha). */
const FIREWORK_RAY_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);

interface FireworkConfig {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly duration: number;
  readonly delay: number;
  readonly tone: 'gold' | 'white' | 'blue';
}

/** 3 quả pháo hoa nổ rồi tắt, lặp lại — vị trí/kích thước/tông màu/nhịp khác
 *  nhau (không nổ cùng lúc), deterministic không Math.random. */
function buildFireworks(): readonly FireworkConfig[] {
  return [
    { cx: 60, cy: 34, radius: 16, duration: 4.2, delay: 0, tone: 'gold' },
    { cx: 176, cy: 96, radius: 13, duration: 3.6, delay: -1.6, tone: 'white' },
    { cx: 24, cy: 100, radius: 11, duration: 4.8, delay: -3, tone: 'blue' },
  ];
}

type SparkTone = 'gold' | 'white';

interface SparkParticle {
  readonly tone: SparkTone;
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly opacity: number;
  readonly duration: number;
  readonly delay: number;
  readonly drift: number;
}

/** Tàn pháo hoa/confetti bay LÊN rồi mờ dần (ngược hướng particle "rơi" kiểu
 *  hoa Tết) — depth-tiered qua size/opacity/duration, deterministic. */
function buildSparks(count: number, seedOffset: number, depthMin: number, depthMax: number): readonly SparkParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seedOffset;
    const depth = depthMin + (((n * 43) % 79) / 100) * (depthMax - depthMin);
    return {
      tone: n % 2 === 0 ? 'gold' : 'white',
      left: (n * 47.3) % 100,
      top: 30 + ((n * 29) % 68),
      size: 1.4 + depth * 2.2,
      opacity: 0.12 + depth * 0.32,
      duration: 9 - depth * 3.5 + (n % 4),
      delay: (n % 6) * -1.4,
      drift: ((n * 13) % 11) - 5,
    };
  });
}

/**
 * Đồng hồ giao thừa (12h, đứng yên) + pháo hoa nổ + tàn lửa/confetti bay lên
 * + skyline mờ cho scene Tết Dương Lịch (1/1) — cùng vai trò với
 * `TetBranchMotif`: dùng chung giữa popup chúc mừng và lớp nền động sau lịch
 * (`CalendarHolidayBackdrop`).
 *
 * Cùng kiến trúc 3 lớp bg/mid/fg như `LaborDayMotif`/`NationalDayMotif` (xem
 * `.html`) để `appHolidayParallax` tịnh tiến từng lớp bằng CSS transform
 * thuần. Không gradient — nền xanh đêm/vàng ánh sáng lấy từ theme màu đã có
 * sẵn của `new-year` trong `holidays.data.ts` (#1e1b4b / #f5d78e).
 */
@Component({
  selector: 'app-new-year-motif',
  templateUrl: './new-year-motif.html',
  styleUrl: './new-year-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewYearMotif {
  protected readonly clockCx = CLOCK_CX;
  protected readonly clockCy = CLOCK_CY;
  protected readonly clockR = CLOCK_R;
  protected readonly clockTicks = CLOCK_TICKS;
  protected readonly fireworkRayAngles = FIREWORK_RAY_ANGLES;

  protected readonly fireworks = buildFireworks();

  protected readonly bgSparks = buildSparks(5, 0, 0.15, 0.4);
  protected readonly midSparks = buildSparks(5, 20, 0.4, 0.7);
  protected readonly fgSparks = buildSparks(4, 40, 0.7, 1);
}
