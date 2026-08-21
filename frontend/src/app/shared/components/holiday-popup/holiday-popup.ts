import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HolidayPopupService } from '../../../core/services/holiday-popup.service';
import { HolidayDecoration } from '../../../models/holiday-theme.model';

const CLOSE_ANIMATION_MS = 220;

@Component({
  selector: 'app-holiday-popup',
  templateUrl: './holiday-popup.html',
  styleUrl: './holiday-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class HolidayPopup {
  private readonly popupService = inject(HolidayPopupService);

  protected readonly resolved = this.popupService.resolved;
  protected readonly closing = signal(false);
  protected readonly particles = [0, 1, 2, 3, 4, 5, 6, 7] as const;
  // Pháo hoa: ít cụm hơn, mỗi cụm là các tia sáng CSS toả từ tâm (xem holiday-popup.css).
  protected readonly fireworkBursts = [0, 1, 2, 3] as const;
  protected readonly fireworkRays = [0, 1, 2, 3, 4, 5, 6, 7] as const;
  // Hoa mai/đào: giảm số lượng để chỉ là chi tiết phụ, không dày đặc.
  protected readonly blossomParticles = [0, 1, 2, 3, 4] as const;
  // Cánh hoa 8/3: bố cục có chủ đích thay vì rải đều — 1 cụm góc trên trái,
  // vài cánh nhỏ góc dưới phải, 1-2 cánh trôi qua nền (xem holiday-popup.css).
  protected readonly petalCluster = [0, 1, 2, 3] as const;
  protected readonly petalCorner = [0, 1] as const;
  protected readonly petalDrift = [0, 1] as const;

  protected hasDecoration(name: HolidayDecoration): boolean {
    return this.resolved()?.theme.decorations.includes(name) ?? false;
  }

  protected close(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => {
      this.popupService.dismiss();
      this.closing.set(false);
    }, CLOSE_ANIMATION_MS);
  }

  protected onEscape(): void {
    if (this.resolved()) this.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
