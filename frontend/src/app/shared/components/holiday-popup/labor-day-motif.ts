import { ChangeDetectionStrategy, Component } from '@angular/core';

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
 * Scene ngày Quốc tế Lao động (1/5): Biểu tượng cơ khí 3D bao gồm cụm 3 Bánh răng (Gears)
 * đan khớp xoay tròn đều đặn (chất liệu Thép không gỉ, Vàng kim loại & Titanium), kết hợp
 * Búa thép & Cờ lê va chạm tạo tia lửa (Spark particles) bắn ra sinh động cùng Mũ bảo hộ
 * công nhân 3D lơ lửng. Cùng vai trò với các motif khác: dùng chung giữa popup chúc mừng
 * và lớp nền động sau lịch (`CalendarHolidayBackdrop`).
 *
 * Chia sẵn 3 lớp bg/mid/fg — mỗi lớp một `<svg>` riêng để `appHolidayParallax`
 * ở nơi gọi tịnh tiến từng lớp với độ sâu khác nhau bằng CSS `transform`
 * thuần. Particle sinh bằng công thức deterministic — không `Math.random()`.
 */
@Component({
  selector: 'app-labor-day-motif',
  templateUrl: './labor-day-motif.html',
  styleUrl: './labor-day-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaborDayMotif {
  /** id duy nhất cho <pattern> lưới kỹ thuật — popup và nền lịch có thể render
   *  cùng lúc hai instance, id trùng sẽ khiến trình duyệt chọn nhầm pattern
   *  của instance kia. */
  protected readonly gridId = `ldm-grid-${nextInstanceId++}`;

  protected readonly bgParticles = buildParticles(6, 0, 0.15, 0.45);
  protected readonly midParticles = buildParticles(6, 20, 0.4, 0.7);
  protected readonly fgParticles = buildParticles(5, 40, 0.7, 1);
}
