import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Tọa độ lá cờ — không còn cột cờ, cờ tràn đều hai bên và Dinh Độc Lập ở chính giữa. */
const FLAG_LEFT = 15;
const FLAG_RIGHT = 185;
const FLAG_TOP = 15;
const FLAG_BOTTOM = 115;

let nextInstanceId = 0;

interface FlagStrip {
  readonly x: number;
  readonly width: number;
  readonly amplitude: number;
  readonly duration: number;
  readonly delay: number;
}

/**
 * Chia lá cờ thành các dải dọc mỏng đung đưa nhẹ nhàng tự nhiên.
 */
function buildStrips(count: number): readonly FlagStrip[] {
  const totalWidth = FLAG_RIGHT - FLAG_LEFT;
  const stripWidth = totalWidth / count;
  return Array.from({ length: count }, (_, i) => {
    const distanceFromCenter = Math.abs(i - (count - 1) / 2) / ((count - 1) / 2);
    return {
      x: FLAG_LEFT + stripWidth * i,
      width: stripWidth + 0.6,
      amplitude: 1.5 + (1 - distanceFromCenter) * 3,
      duration: 5.8 + i * 0.25,
      delay: i * -0.35,
    };
  });
}

/**
 * Lá cờ Việt Nam phấp phới với Dinh Độc Lập làm hình nền trung tâm.
 */
@Component({
  selector: 'app-vietnam-flag-motif',
  templateUrl: './vietnam-flag-motif.html',
  styleUrl: './vietnam-flag-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VietnamFlagMotif {
  protected readonly flagTop = FLAG_TOP;
  protected readonly flagBottom = FLAG_BOTTOM;
  protected readonly flagLeft = FLAG_LEFT;
  protected readonly flagRight = FLAG_RIGHT;

  /** Vị trí X của Dinh Độc Lập — đặt tại 100 để nằm CHÍNH GIỮA lá cờ đỏ. */
  protected readonly palaceX = (FLAG_LEFT + FLAG_RIGHT) / 2;

  /** id duy nhất cho <linearGradient> — popup và nền lịch có thể render CÙNG
   *  LÚC hai instance của component này (giống lý do có clipId ở trống đồng). */
  protected readonly gradId = `vfm-grad-${nextInstanceId++}`;

  protected readonly strips = buildStrips(9);

  /** Bụi hạt đỏ/vàng bay chậm qua khung — vài hạt trôi trái→phải, một số
   *  ngược lại, deterministic (không Math.random) để layout ổn định. */
  protected readonly particles = Array.from({ length: 12 }, (_, i) => {
    const depth = 0.3 + ((i * 41) % 71) / 100;
    return {
      left: (i * 53.7) % 100,
      top: 4 + ((i * 31) % 92),
      size: 2 + depth * 3,
      opacity: 0.15 + depth * 0.4,
      duration: 11 - depth * 4 + (i % 5),
      delay: (i % 6) * -1.8,
      gold: i % 3 === 0,
      reverse: i % 2 === 0,
    };
  });
}
