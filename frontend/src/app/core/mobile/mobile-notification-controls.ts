import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MobileNotificationsService } from './mobile-notifications.service';

@Component({
  selector: 'app-mobile-notification-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (mobile.supported && (!compact() || mobile.permission() !== 'granted')) {
    <section aria-label="Thông báo trên Android" class="mobile-notifications" [class.compact]="compact()">
      <strong>Nhắc lịch trên điện thoại</strong>
      @if (mobile.permission() !== 'granted') {
        <p>Bật thông báo để nhận nhắc lịch nổi kèm âm thanh khi app ở nền.</p>
        @if (mobile.permission() === 'denied') {
          <button type="button" (click)="mobile.openSettings()">Mở cài đặt thông báo</button>
        } @else {
          <button type="button" [disabled]="mobile.busy()" (click)="mobile.enable()">Bật thông báo</button>
        }
      } @else {
        <p>Đã bật · {{ mobile.scheduled() }} lời nhắc đã hẹn trên máy.</p>
        <button type="button" [disabled]="mobile.busy()" (click)="mobile.test()">Thử báo sau 10 giây</button>
        <button type="button" (click)="mobile.refresh()">Đồng bộ lời nhắc</button>
        @if (!compact()) { <button type="button" (click)="mobile.openSettings()">Cài đặt âm & thông báo</button> }
      }
      @if (!compact()) {
        @if (!mobile.exact()) {
          <p>Chưa bật báo đúng giờ. Android có thể dời thời gian báo để tiết kiệm pin.</p>
          <button type="button" (click)="mobile.enableExact()">Cho phép báo đúng giờ</button>
        }
        <p>Giữ tối đa 128 lời nhắc trong 30 ngày. Mở app khi đổi lịch để cập nhật. Chat riêng nhận trực tiếp khi app đang hoạt động; chưa có thông báo chat khi app đã bị tắt hẳn.</p>
      }
      @if (mobile.error()) { <p role="status">{{ mobile.error() }}</p> }
    </section>
  }`,
  styles: `:host { display: block; flex-shrink: 0; }
    .mobile-notifications { padding: 12px; border: 1px solid var(--color-border); border-radius: 12px;
      background: var(--color-accent-soft); color: var(--color-text); font-size: 13px; }
    .compact { padding: 8px 12px; border-radius: 0; }
    p { margin: 6px 0; line-height: 1.5; }
    button { border: 1px solid var(--color-accent); background: var(--color-surface);
      color: var(--color-accent); border-radius: 8px; padding: 9px 12px; margin: 4px 6px 4px 0; min-height: 44px; }
    button:disabled { opacity: .5; }`,
})
export class MobileNotificationControls {
  readonly compact = input(false);
  protected readonly mobile = inject(MobileNotificationsService);
  constructor() {
    if (this.mobile.supported) void this.mobile.checkPermission().catch(() => undefined);
  }
}
