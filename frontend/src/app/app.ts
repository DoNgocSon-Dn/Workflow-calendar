import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandThemeService } from './core/theme/brand-theme-service';
import { ThemeService } from './core/theme/theme-service';
import { DialogHost } from './shared/components/dialog-host/dialog-host';
import { DesktopNavigationService } from './core/desktop/desktop-navigation.service';
import { SocialStore } from './features/social/social.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DialogHost],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly social = inject(SocialStore);
  private readonly desktopNavigation = inject(DesktopNavigationService);
  private readonly themeService = inject(ThemeService);
  private readonly brandThemeService = inject(BrandThemeService);
}
