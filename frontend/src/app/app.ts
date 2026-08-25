import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandThemeService } from './core/theme/brand-theme-service';
import { ThemeService } from './core/theme/theme-service';
import { DialogHost } from './shared/components/dialog-host/dialog-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DialogHost],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly themeService = inject(ThemeService);
  private readonly brandThemeService = inject(BrandThemeService);
}
