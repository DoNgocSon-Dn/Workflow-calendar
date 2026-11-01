import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandThemeService } from './core/theme/brand-theme-service';
import { ThemeService } from './core/theme/theme-service';
import { DialogHost } from './shared/components/dialog-host/dialog-host';
import { DesktopNavigationService } from './core/desktop/desktop-navigation.service';
import { SocialStore } from './features/social/social.store';
import { MobileRuntimeService } from './core/mobile/mobile-runtime.service';
import { HolidayThemeService } from './features/calendar/data/holiday-theme.service';
import { HolidayPopup } from './shared/components/holiday-popup/holiday-popup';
import { AuthStore } from './core/auth/auth-store';
import { MobileNavigation } from './core/mobile/mobile-navigation';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DialogHost, HolidayPopup, MobileNavigation],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly authStore = inject(AuthStore);
  private readonly holidayTheme = inject(HolidayThemeService);
  private readonly mobileRuntime = inject(MobileRuntimeService);
  private readonly social = inject(SocialStore);
  private readonly desktopNavigation = inject(DesktopNavigationService);
  private readonly themeService = inject(ThemeService);
  private readonly brandThemeService = inject(BrandThemeService);
}
