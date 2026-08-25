import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogService } from '../../../core/services/dialog.service';

/**
 * Gắn DUY NHẤT một lần ở app root (xem app.html). Thay cho window.confirm()/
 * alert()/prompt() ở mọi nơi trong app — xem DialogService để biết lý do.
 */
@Component({
  selector: 'app-dialog-host',
  templateUrl: './dialog-host.html',
  styleUrl: './dialog-host.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class DialogHost {
  protected readonly dialog = inject(DialogService);

  onBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    const req = this.dialog.request();
    if (!req || req.kind === 'alert') return;
    if (req.kind === 'prompt') this.dialog.cancelPrompt();
    else this.dialog.respondNo();
  }

  onEscape(): void {
    const req = this.dialog.request();
    if (!req) return;
    if (req.kind === 'alert') this.dialog.acknowledge();
    else if (req.kind === 'prompt') this.dialog.cancelPrompt();
    else this.dialog.respondNo();
  }
}
