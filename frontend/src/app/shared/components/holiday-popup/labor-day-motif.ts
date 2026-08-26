import { ChangeDetectionStrategy, Component } from '@angular/core';

interface GearSpec {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly toothW: number;
  readonly toothH: number;
  readonly teethAngles: readonly number[];
}

function gear(cx: number, cy: number, r: number, teethCount: number, toothW: number, toothH: number): GearSpec {
  return {
    cx,
    cy,
    r,
    toothW,
    toothH,
    teethAngles: Array.from({ length: teethCount }, (_, i) => (360 / teethCount) * i),
  };
}

type ParticleShape = 'square' | 'line';

interface MechParticle {
  readonly shape: ParticleShape;
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly opacity: number;
  readonly duration: number;
  readonly delay: number;
  readonly rotate: number;
}

/** depthMin/depthMax chỉ ảnh hưởng size/opacity/duration — không phải vị trí,
 *  nên hai lớp liền kề (bg/mid) không bị trùng hạt dù cùng công thức chỉ số. */
function buildParticles(count: number, seedOffset: number, depthMin: number, depthMax: number): readonly MechParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seedOffset;
    const depth = depthMin + (((n * 37) % 71) / 100) * (depthMax - depthMin);
    return {
      shape: n % 2 === 0 ? 'square' : 'line',
      left: (n * 53.7) % 100,
      top: 6 + ((n * 31) % 88),
      size: 2.5 + depth * 5,
      opacity: 0.1 + depth * 0.42,
      duration: 9 - depth * 3.5 + (n % 4),
      delay: (n % 6) * -1.3,
      rotate: (n * 29) % 360,
    };
  });
}

let nextInstanceId = 0;

/**
 * 4 bánh răng 3D (SVG + CSS, không WebGL) + dụng cụ lao động cho scene Quốc
 * tế Lao động — cùng vai trò với `TetBranchMotif`: dùng chung giữa popup
 * chúc mừng và lớp nền động sau lịch (`CalendarHolidayBackdrop`).
 *
 * Chia sẵn 3 lớp bg/mid/fg (xem `.html`) — mỗi lớp là một `<svg>` riêng để
 * `appHolidayParallax` ở nơi gọi (ghi `--holiday-px/py` lên `.holiday-backdrop`
 * cha) tịnh tiến từng lớp với độ sâu khác nhau bằng CSS `transform` thuần,
 * không lệ thuộc tỉ lệ scale của viewBox. Bánh răng chạm nhau LUÔN quay
 * ngược chiều nhau (A↔B, B↔C) — đúng cơ học bánh răng thật, không phải tất cả
 * quay cùng chiều. Particle cơ khí (vuông/gạch) sinh bằng công thức
 * deterministic như `DongSonDrumMotif.dust` — không `Math.random()`.
 */
@Component({
  selector: 'app-labor-day-motif',
  templateUrl: './labor-day-motif.html',
  styleUrl: './labor-day-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaborDayMotif {
  /** id duy nhất cho <pattern> lưới kỹ thuật — popup và nền lịch có thể
   *  render cùng lúc hai instance, id trùng sẽ khiến trình duyệt chọn nhầm
   *  pattern của instance kia (giống lý do có gridId/clipId ở các motif khác). */
  protected readonly gridId = `ldm-grid-${nextInstanceId++}`;

  // Bg: lớn nhất + rất nhỏ. Mid: trung bình, ăn khớp A. Fg: nhỏ hơn, ăn khớp B.
  protected readonly gearA = gear(156, 46, 34, 14, 11, 15);
  protected readonly gearB = gear(110, 86, 23, 10, 9, 12);
  protected readonly gearC = gear(80, 124, 14, 8, 6, 9);
  protected readonly gearD = gear(176, 118, 9, 6, 4, 6);

  protected readonly bgParticles = buildParticles(6, 0, 0.15, 0.45);
  protected readonly midParticles = buildParticles(6, 20, 0.4, 0.7);
  protected readonly fgParticles = buildParticles(5, 40, 0.7, 1);
}
