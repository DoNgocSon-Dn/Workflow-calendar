import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Cột cờ CỐ ĐỊNH ở mép phải — lá cờ "gắn" vào đây, mép tự do (vẫy mạnh
 *  nhất) ở xa cột nhất (bên trái). Cùng kỹ thuật với NationalDayMotif (2/9):
 *  chỉ phần vải deform theo sóng lan từ cột ra mép, cột + điểm gắn đứng yên
 *  tuyệt đối — đây là yêu cầu quan trọng nhất của spec 30/4, tránh lặp lại
 *  lỗi bản cũ (cờ "tràn đều hai bên", không có điểm neo cố định nào). */
const POLE_X = 186;
const FLAG_LEFT = 20;
const FLAG_RIGHT = 182;
const FLAG_TOP = 18;
const FLAG_BOTTOM = 112;

let nextInstanceId = 0;

interface FlagStrip {
  readonly x: number;
  readonly width: number;
  readonly amplitude: number;
  readonly delayMs: number;
}

/**
 * Dải dọc mỏng, biên độ + độ trễ TĂNG DẦN từ cột cờ (phải) ra mép tự do
 * (trái) — sóng gió lan truyền dọc lá cờ thay vì mọi điểm rung cùng lúc,
 * đúng cơ học vải thật. Cùng công thức với NationalDayMotif.buildFlagSegments.
 */
function buildStrips(count: number): readonly FlagStrip[] {
  const totalWidth = FLAG_RIGHT - FLAG_LEFT;
  const stripWidth = totalWidth / count;
  return Array.from({ length: count }, (_, i) => {
    const fromPole = count - 1 - i; // i=count-1 sát cột (0), i=0 ở mép tự do (lớn nhất)
    return {
      x: FLAG_LEFT + stripWidth * i,
      width: stripWidth + 0.6,
      amplitude: 1 + fromPole * 0.55,
      delayMs: fromPole * 60,
    };
  });
}

interface DoveConfig {
  readonly baseX: number;
  readonly baseY: number;
  readonly scale: number;
  readonly opacity: number;
  readonly duration: number;
  readonly delay: number;
  readonly flip: boolean;
  /** Chu kỳ vỗ cánh (giây) — TÁCH RIÊNG khỏi `duration` (chu kỳ bay ngang).
   *  Không có sprite nhiều khung hình thật (chỉ 1 ảnh tĩnh dove-flying.png)
   *  nên giả lập "frame" bằng nén/giãn ảnh theo chiều dọc, xem .vfm-dove-flap
   *  trong .css. Mỗi con một nhịp hơi khác để không vỗ cánh đồng bộ y hệt. */
  readonly flapDuration: number;
}

/** 4 con chim bồ câu bay MỘT CHIỀU trái→phải (không lượn qua lại), mỗi con
 *  kích thước/độ mờ/tốc độ/độ lệch pha khác nhau — deterministic, không
 *  Math.random, để layout ổn định giữa các lần render. */
function buildDoves(): readonly DoveConfig[] {
  return [
    { baseX: -18, baseY: 18, scale: 0.1, opacity: 0.92, duration: 15, delay: 0, flip: false, flapDuration: 0.55 },
    { baseX: -40, baseY: 34, scale: 0.075, opacity: 0.75, duration: 19, delay: -6, flip: false, flapDuration: 0.62 },
    { baseX: -10, baseY: 46, scale: 0.085, opacity: 0.85, duration: 17, delay: -11, flip: false, flapDuration: 0.48 },
    { baseX: -55, baseY: 10, scale: 0.06, opacity: 0.65, duration: 22, delay: -15, flip: false, flapDuration: 0.7 },
  ];
}

interface StarConfig {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly minOpacity: number;
  readonly maxOpacity: number;
  readonly duration: number;
  readonly delay: number;
}

/** 6 ngôi sao vàng nhỏ rải rác quanh cảnh, độ mờ thấp, fade rất chậm — điểm
 *  nhấn phụ, không phải tâm điểm (tâm điểm là lá cờ + Dinh Độc Lập). Vị trí
 *  cố ý tránh vùng lá cờ/chim/Dinh Độc Lập để không bị che hoặc rối mắt. */
function buildStars(): readonly StarConfig[] {
  return [
    { x: 10, y: 8, scale: 0.055, minOpacity: 0.12, maxOpacity: 0.32, duration: 7, delay: 0 },
    { x: 196, y: 20, scale: 0.04, minOpacity: 0.1, maxOpacity: 0.28, duration: 9, delay: -2.5 },
    { x: 6, y: 70, scale: 0.045, minOpacity: 0.08, maxOpacity: 0.24, duration: 8.5, delay: -5 },
    { x: 192, y: 95, scale: 0.06, minOpacity: 0.14, maxOpacity: 0.34, duration: 6.5, delay: -1.2 },
    { x: 30, y: 128, scale: 0.035, minOpacity: 0.1, maxOpacity: 0.26, duration: 10, delay: -4 },
    { x: 170, y: 132, scale: 0.05, minOpacity: 0.12, maxOpacity: 0.3, duration: 7.8, delay: -6.4 },
  ];
}

/**
 * Cờ Việt Nam (cột cố định + vải phấp phới từ cột ra mép) + Dinh Độc Lập
 * (silhouette mờ, không phải hình màu đầy đủ) + chim bồ câu bay một chiều +
 * sao vàng rải rác + ruy băng đỏ mềm — scene chủ đề 30/4, dùng chung giữa
 * popup chúc mừng và lớp nền động sau lịch (`CalendarHolidayBackdrop`).
 *
 * Thiết kế theo đúng tinh thần `NationalDayMotif` (2/9): trang trọng, tối
 * giản, một tâm điểm rõ ràng (cờ), không nhồi nhét nhiều vật thể cạnh tranh
 * sự chú ý. Ưu tiên đọc được lịch phía trước — mọi lớp trang trí đều opacity
 * thấp và không animate quá mạnh.
 */
@Component({
  selector: 'app-vietnam-flag-motif',
  templateUrl: './vietnam-flag-motif.html',
  styleUrl: './vietnam-flag-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VietnamFlagMotif {
  protected readonly poleX = POLE_X;
  protected readonly flagTop = FLAG_TOP;
  protected readonly flagBottom = FLAG_BOTTOM;
  protected readonly flagLeft = FLAG_LEFT;
  protected readonly flagRight = FLAG_RIGHT;

  /** Tâm lá cờ — Dinh Độc Lập neo vào đúng điểm này (không phải tâm khung
   *  ảnh PNG, vì ảnh có khoảng trong suốt lớn phía trên tòa nhà, xem offset
   *  ảnh bù trong template). */
  protected readonly palaceX = (FLAG_LEFT + FLAG_RIGHT) / 2;
  protected readonly palaceY = (FLAG_TOP + FLAG_BOTTOM) / 2;

  /** id duy nhất cho <linearGradient>/<clipPath> — popup và nền lịch có thể
   *  render CÙNG LÚC hai instance của component này. */
  protected readonly instanceId = nextInstanceId++;
  protected readonly gradId = `vfm-grad-${this.instanceId}`;
  protected readonly poleGradId = `vfm-pole-${this.instanceId}`;

  protected readonly strips = buildStrips(9);
  protected readonly doves = buildDoves();
  protected readonly stars = buildStars();

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
