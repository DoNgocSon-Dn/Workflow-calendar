import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HolidayComposition, HolidayTheme } from '../../../models/holiday-theme.model';

/**
 * Renders the layered "scene" (background glow → decorative layer → focal
 * shape) for one `HolidayArchetype`. Kept separate from `HolidayPopup` so the
 * shell component doesn't grow into a monolith — this one only knows how to
 * draw a composition given theme colors, nothing about popup state/dismissal.
 */
@Component({
  selector: 'app-holiday-visual',
  templateUrl: './holiday-visual.html',
  styleUrl: './holiday-visual.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayVisual {
  readonly composition = input.required<HolidayComposition>();
  readonly theme = input.required<HolidayTheme>();
}
