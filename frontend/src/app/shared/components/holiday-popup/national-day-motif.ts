import { ChangeDetectionStrategy, Component } from '@angular/core';

/** KHÔNG vẽ cột cờ (bỏ theo yêu cầu) — POLE_X chỉ còn là điểm neo VÔ HÌNH
 *  (transform-origin cho sóng vải), đặt gần GIỮA khung thay vì sát mép phải
 *  như bản có cột trước đây. Cờ "gắn" vào điểm này, mép tự do (vẫy mạnh nhất)
 *  ở xa điểm neo nhất (bên trái); điểm neo ĐỨNG YÊN tuyệt đối — chỉ phần vải
 *  deform, không bao giờ translate cả lá cờ. Đặt gần giữa (không đúng x=100
 *  tuyệt đối vì bản thân cờ còn trải rộng sang trái) để khi khung nền đã canh
 *  giữa màn hình (xem calendar-holiday-backdrop.css), trọng tâm lá cờ cũng
 *  rơi gần giữa màn hình theo, thay vì dồn hẳn về nửa phải của khung. */
const POLE_X = 150;
const FLAG_TOP = 8;
const FLAG_BOTTOM = 64;
const FLAG_LEFT = 54;
const FLAG_RIGHT = 146;

interface FlagSegment {
  readonly x: number;
  readonly width: number;
  readonly amplitude: number;
  /** ms — bậc thang tăng dần, gió truyền từ cột cờ (index 0) ra mép cờ (index
   *  cuối), không phải delay ngẫu nhiên. */
  readonly delayMs: number;
}

/** 6 dải dọc, delay + biên độ tăng dần từ cột cờ (phải) ra mép cờ (trái) —
 *  mép tự do vẫy mạnh hơn hẳn phần sát cột, đúng cơ học vải có gió. */
function buildFlagSegments(): readonly FlagSegment[] {
  const count = 6;
  const totalWidth = FLAG_RIGHT - FLAG_LEFT;
  const segWidth = totalWidth / count;
  return Array.from({ length: count }, (_, i) => {
    const fromPole = count - 1 - i; // 0 = sát cột, count-1 = mép tự do
    return {
      x: FLAG_LEFT + segWidth * i,
      width: segWidth + 0.6,
      amplitude: 1 + fromPole * 0.9,
      delayMs: fromPole * 60,
    };
  });
}

type ParticleTone = 'gold' | 'red';

interface FlagParticle {
  readonly tone: ParticleTone;
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly opacity: number;
  readonly duration: number;
  readonly delay: number;
  readonly reverse: boolean;
}

/** Giống VietnamFlagMotif.particles về kỹ thuật (deterministic, không
 *  Math.random) nhưng là bộ số/instance RIÊNG — 2/9 không dùng chung particle
 *  với 30/4, giữ hai holiday độc lập về mặt hiện thực. Cố tình ÍT (spec: "quá
 *  nhiều particle" nằm trong danh sách không được làm). */
function buildParticles(count: number, seedOffset: number, depthMin: number, depthMax: number): readonly FlagParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seedOffset;
    const depth = depthMin + (((n * 43) % 79) / 100) * (depthMax - depthMin);
    return {
      tone: n % 3 === 0 ? 'gold' : 'red',
      left: (n * 47.3) % 100,
      top: 4 + ((n * 29) % 92),
      size: 1.4 + depth * 2,
      opacity: 0.08 + depth * 0.22,
      duration: 12 - depth * 5 + (n % 5),
      delay: (n % 6) * -1.6,
      reverse: n % 2 === 0,
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
}

/** 5 chim bồ câu — ẢNH THẬT (cùng file `dove-flying.png` đang dùng ở 30/4,
 *  161×186px, xem `VietnamFlagMotif`), không còn path vẽ tay. `scale` tính
 *  theo tỉ lệ tương tự `VietnamFlagMotif.buildDoves` (0.06–0.13) — ảnh gốc to
 *  hơn hẳn bounding-box của path cũ (72×34), scale cũ (0.13–0.3) sẽ làm chim
 *  to gấp nhiều lần dự kiến nếu giữ nguyên. Kích thước + độ mờ + tốc độ khác
 *  nhau để tạo chiều sâu: con ở xa (bg) nhỏ + mờ + chậm, con ở gần (fg) lớn +
 *  rõ + nhanh hơn. Bố trí theo đúng spec: vài con phía trên, vài con hai bên,
 *  một con gần trung tâm scene nhưng rất mờ (doves[4]). Deterministic. */
function buildDoves(): readonly DoveConfig[] {
  return [
    { baseX: 14, baseY: 14, scale: 0.13, opacity: 0.85, duration: 13, delay: 0, flip: false },
    { baseX: 172, baseY: 8, scale: 0.1, opacity: 0.65, duration: 16, delay: -6, flip: true },
    { baseX: 2, baseY: 92, scale: 0.09, opacity: 0.55, duration: 18, delay: -9, flip: false },
    { baseX: 176, baseY: 78, scale: 0.07, opacity: 0.4, duration: 20, delay: -3, flip: true },
    { baseX: 96, baseY: 96, scale: 0.06, opacity: 0.22, duration: 22, delay: -13, flip: false },
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

/** 6 ngôi sao vàng nhỏ — vị trí CHỦ Ý (không rải ngẫu nhiên): tránh vùng lá
 *  cờ/chim để không bị che, đặt ở khoảng trống phía trên và nền phía dưới.
 *  Fade rất nhẹ, không nhấp nháy. Cùng kỹ thuật với VietnamFlagMotif.buildStars. */
function buildStars(): readonly StarConfig[] {
  return [
    { x: 60, y: 10, scale: 0.05, minOpacity: 0.12, maxOpacity: 0.3, duration: 7, delay: 0 },
    { x: 8, y: 40, scale: 0.04, minOpacity: 0.1, maxOpacity: 0.26, duration: 8.5, delay: -3 },
    { x: 130, y: 46, scale: 0.045, minOpacity: 0.1, maxOpacity: 0.28, duration: 9, delay: -5 },
    { x: 30, y: 128, scale: 0.05, minOpacity: 0.12, maxOpacity: 0.3, duration: 7.6, delay: -2 },
    { x: 110, y: 138, scale: 0.038, minOpacity: 0.08, maxOpacity: 0.22, duration: 10, delay: -6.5 },
    { x: 178, y: 30, scale: 0.035, minOpacity: 0.08, maxOpacity: 0.24, duration: 6.5, delay: -1.2 },
  ];
}

/**
 * Cờ Việt Nam (cột cố định + vải phấp phới) + sao vàng lớn (hero) + chim bồ
 * câu hòa bình + sao vàng nhỏ rải có chủ đích + ruy băng đỏ mềm + skyline mờ
 * cho scene Quốc khánh 2/9 — cùng vai trò với `TetBranchMotif`: dùng chung
 * giữa popup chúc mừng và lớp nền động sau lịch (`CalendarHolidayBackdrop`).
 *
 * Thiết kế theo đúng tinh thần `VietnamFlagMotif` (30/4): trang trọng, tối
 * giản, cinematic — một tâm điểm rõ ràng (cờ), không nhồi nhét vật thể nặng
 * (đã bỏ lễ đài Quảng trường Ba Đình của bản trước — không có trong spec này,
 * và một khối bệ+người quá nặng cho một scene được yêu cầu "minimal"). KHÔNG
 * gradient ở bất kỳ đâu (kể cả cột cờ — trước dùng linearGradient, giờ đổi
 * sang 2 tông màu đặc + viền highlight).
 *
 * Chia 3 lớp bg/mid/fg (xem `.html`) để `appHolidayParallax` tịnh tiến từng
 * lớp độc lập bằng CSS transform thuần. Chim bồ câu dùng CHUNG file ảnh với
 * `VietnamFlagMotif` (30/4) — `dove-flying.png` — nhưng animation/scale/vị
 * trí là bộ số RIÊNG (`buildDoves` ở đây, không import/tái dùng component
 * kia), hai holiday vẫn giữ độc lập về code dù cùng asset ảnh.
 */
@Component({
  selector: 'app-national-day-motif',
  templateUrl: './national-day-motif.html',
  styleUrl: './national-day-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NationalDayMotif {
  protected readonly poleX = POLE_X;
  protected readonly flagTop = FLAG_TOP;
  protected readonly flagBottom = FLAG_BOTTOM;

  protected readonly starCx = (FLAG_LEFT + FLAG_RIGHT) / 2;
  protected readonly starCy = (FLAG_TOP + FLAG_BOTTOM) / 2;

  protected readonly flagSegments = buildFlagSegments();
  protected readonly doves = buildDoves();
  protected readonly stars = buildStars();

  protected readonly bgParticles = buildParticles(3, 0, 0.15, 0.4);
  protected readonly midParticles = buildParticles(3, 20, 0.4, 0.7);
  protected readonly fgParticles = buildParticles(3, 40, 0.7, 1);
}
