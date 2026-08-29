import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Đồng hồ chỉ đúng 12h giao thừa — đặt CHÍNH GIỮA khung hình (x=100, y=60) */
const CLOCK_CX = 100;
const CLOCK_CY = 60;
const CLOCK_R = 32;

/** Góc 12 vạch giờ quanh mặt đồng hồ. */
const CLOCK_TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

/** 8 tia của một vụ pháo hoa */
const FIREWORK_RAY_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);

interface FireworkConfig {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly duration: number;
  readonly delay: number;
  readonly tone: 'gold' | 'white' | 'blue';
}

/** 3 quả pháo hoa nổ cân đối xung quanh đồng hồ trung tâm */
function buildFireworks(): readonly FireworkConfig[] {
  return [
    { cx: 38, cy: 50, radius: 18, duration: 4.2, delay: 0, tone: 'gold' },
    { cx: 162, cy: 50, radius: 18, duration: 3.6, delay: -1.6, tone: 'white' },
    { cx: 100, cy: 126, radius: 14, duration: 4.8, delay: -3, tone: 'blue' },
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

/** Tàn pháo hoa/confetti bay LÊN rồi mờ dần */
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

  protected readonly bgSparks = buildSparks(12, 1, 0.1, 0.4);
  protected readonly midSparks = buildSparks(16, 20, 0.4, 0.75);
  protected readonly fgSparks = buildSparks(10, 45, 0.75, 1.0);
}
