import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * "45/200" cạnh một ô nhập có `maxlength` — HTML `maxlength` chặn gõ thêm
 * nhưng không tự cho người dùng biết còn bao nhiêu chỗ trống, nên vẫn phải tự
 * gõ tới lúc "bị chặn" mới biết đã chạm giới hạn. Đổi màu khi gần/chạm mức
 * tối đa để cảnh báo sớm hơn, không phải đợi con số trùng nhau mới để ý.
 */
@Component({
  selector: 'app-char-counter',
  template: `<span class="char-counter" [class.char-counter--warn]="isNear()" [class.char-counter--max]="isFull()"
    >{{ current() }}/{{ max() }}</span
  >`,
  styleUrl: './char-counter.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharCounter {
  readonly current = input.required<number>();
  readonly max = input.required<number>();

  /** 90% trở lên: sắp hết chỗ, đổi màu cảnh báo trước khi thực sự chạm giới hạn. */
  protected readonly isNear = computed(() => this.current() >= this.max() * 0.9);
  protected readonly isFull = computed(() => this.current() >= this.max());
}
