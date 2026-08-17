import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Density, DensityService } from '../../../../core/density/density-service';
import { Theme, ThemeService } from '../../../../core/theme/theme-service';

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.html',
  styleUrl: './settings-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModal {
  protected readonly themeService = inject(ThemeService);
  protected readonly densityService = inject(DensityService);

  readonly closed = output<void>();

  setTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  setDensity(density: Density): void {
    this.densityService.setDensity(density);
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
