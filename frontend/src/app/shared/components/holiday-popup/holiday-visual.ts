import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HolidayComposition, HolidayTheme } from '../../../models/holiday-theme.model';
import { TetBranchMotif } from './tet-branch-motif';
import { DongSonDrumMotif } from './dong-son-drum-motif';
import { VietnamFlagMotif } from './vietnam-flag-motif';
import { LaborDayMotif } from './labor-day-motif';
import { NationalDayMotif } from './national-day-motif';
import { NewYearMotif } from './new-year-motif';

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
  imports: [TetBranchMotif, DongSonDrumMotif, VietnamFlagMotif, LaborDayMotif, NationalDayMotif, NewYearMotif],
})
export class HolidayVisual {
  readonly composition = input.required<HolidayComposition>();
  readonly theme = input.required<HolidayTheme>();
}
