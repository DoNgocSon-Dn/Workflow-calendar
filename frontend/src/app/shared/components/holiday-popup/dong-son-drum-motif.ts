import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Tâm mặt trống — mọi hoa văn xoay quanh điểm này. */
const CX = 100;
const CY = 100;

/** N bản sao của MỘT hình vẽ sẵn ở vị trí 12-giờ — xoay quanh tâm trống để
 *  rải đều thành vòng tròn. Dùng cho các dải răng cưa viền ngoài (phần duy
 *  nhất còn tự vẽ — hoa văn chính giữa mặt trống giờ lấy từ ảnh thật). */
function angles(count: number): readonly { readonly transform: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    transform: `rotate(${(360 / count) * i} ${CX} ${CY})`,
  }));
}

let nextInstanceId = 0;

/**
 * Trống đồng Đông Sơn — vật thể chính của scene Giỗ Tổ Hùng Vương. Cùng vai
 * trò với `TetBranchMotif`: dùng chung giữa popup và nền sau lịch. Không
 * nhận input — kích thước/vị trí do CSS của nơi gọi quyết định.
 *
 * Hoa văn mặt trống và chim Lạc KHÔNG tự vẽ — lấy trực tiếp từ ảnh vector
 * hoa văn trống đồng thật (public/assets/holidays/dong-son/), ghép vào scene
 * bằng `mix-blend-mode: multiply` (nền trắng của ảnh biến mất, chỉ còn nét
 * hoa văn) rồi mới thêm animation xoay/bay — không phải hoa văn tự sáng tác.
 */
@Component({
  selector: 'app-dong-son-drum-motif',
  templateUrl: './dong-son-drum-motif.html',
  styleUrl: './dong-son-drum-motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DongSonDrumMotif {
  protected readonly cx = CX;
  protected readonly cy = CY;

  /** id duy nhất cho <clipPath> — popup và nền lịch có thể render CÙNG LÚC
   *  hai instance của component này; id trùng nhau sẽ khiến trình duyệt
   *  chọn nhầm clipPath của instance kia. */
  protected readonly clipId = `dsd-face-clip-${nextInstanceId++}`;

  /** Outer Ring layer — răng cưa vòng ngoài, vẫn tự vẽ vì đây là phần khung
   *  kim loại của thân trống, không phải hoa văn lấy từ ảnh. */
  protected readonly outerTicks = angles(24);

  /** Bụi đồng (bronze dust) — mỗi hạt một pha animation riêng, không đứng
   *  yên sau khi random một lần. depth thấp = xa hơn: nhỏ, mờ, chậm; depth
   *  cao = gần hơn: to, rõ, nhanh — deterministic, không Math.random(). */
  protected readonly dust = Array.from({ length: 16 }, (_, i) => {
    const depth = 0.3 + ((i * 37) % 71) / 100; // 0.3–1.0
    return {
      left: (i * 61.8) % 100,
      top: 6 + ((i * 29) % 82),
      size: 1.4 + depth * 2.6,
      opacity: 0.12 + depth * 0.38,
      duration: 10 - depth * 3.5 + (i % 4),
      delay: (i % 7) * -1.4,
    };
  });
}
