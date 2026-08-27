import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslationService } from '../../../../core/i18n/translation.service';

/** Một dòng trong danh sách gợi ý mention. */
export interface MentionOption {
  /** `all` là mục "báo cho cả nhóm", luôn đứng đầu danh sách. */
  readonly kind: 'all' | 'user';
  /** Chuỗi được chèn sau dấu `@` — cũng là nhãn lưu vào metadata tin nhắn. */
  readonly label: string;
  readonly userId?: string;
  /** Chữ cái đầu dựng avatar cho thành viên; mục @All dùng icon thay avatar. */
  readonly initial: string;
  readonly color: string;
}

/**
 * Danh sách gợi ý khi người dùng gõ `@` trong ô nhập chat.
 *
 * Thuần trình bày: mọi trạng thái (đang lọc gì, đang chọn dòng nào) do khung
 * chat giữ, vì chúng gắn chặt với nội dung và vị trí con trỏ trong ô nhập.
 * Component này chỉ vẽ ra và báo lại người dùng đã chọn dòng nào.
 */
@Component({
  selector: 'app-mention-popup',
  templateUrl: './mention-popup.html',
  styleUrl: './mention-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentionPopup {
  protected readonly i18n = inject(TranslationService);

  /** Cố định (không sinh động) vì mỗi lúc chỉ có đúng một khung chat mở —
   *  ô nhập trỏ tới id này qua aria-controls/aria-activedescendant. */
  readonly listboxId = 'chat-mention-listbox';

  optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }

  readonly options = input.required<readonly MentionOption[]>();
  /** Dòng đang được bàn phím trỏ tới. -1 khi không có dòng nào. */
  readonly activeIndex = input<number>(0);

  readonly selected = output<MentionOption>();
  readonly hovered = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Danh sách có thể dài hơn khung nhìn của popup; không kéo theo thì bấm
    // ArrowDown một lúc là dòng đang chọn biến mất khỏi tầm mắt. Chạy sau khi
    // Angular đã vẽ xong để chắc chắn dòng mới đã có trong DOM.
    afterRenderEffect(() => {
      const index = this.activeIndex();
      if (index < 0 || this.options().length === 0) return;

      this.host.nativeElement
        .querySelector<HTMLElement>(`#${this.optionId(index)}`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  /**
   * Chặn mousedown thay vì dựa vào click.
   *
   * mousedown xảy ra TRƯỚC blur, nên chặn ở đây giữ được focus trong ô nhập —
   * không thì ô nhập mất focus, popup đóng theo, và cú click rơi vào khoảng
   * không. Việc chèn mention vẫn chạy ở (click) để bàn phím và chuột đi qua
   * cùng một đường.
   */
  protected onMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  protected choose(option: MentionOption): void {
    this.selected.emit(option);
  }
}
