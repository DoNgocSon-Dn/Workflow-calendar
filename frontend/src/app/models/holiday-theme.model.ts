/**
 * Data model for the Holiday Popup system. A holiday is fully described by a
 * date rule (when it should appear), a visual theme (colors + decoration),
 * and its display content. Adding a new holiday never requires touching the
 * component or service — see `data/holidays.data.ts`. A holiday may omit
 * `theme` entirely; the popup falls back to `DEFAULT_HOLIDAY_THEME` so future
 * holidays don't require bespoke art before they can be added.
 */

/** Lower number = shown first when multiple holidays match the same day. */
export type HolidayPriority = number;

/**
 * When a holiday should be considered "active":
 * - `fixed`: recurs every year on the same Gregorian month/day (most holidays).
 * - `explicit`: a per-year curated list of date ranges. Kept for edge cases
 *   that still need manual override — normal lunar holidays should use
 *   `lunar`/`lunar-range` instead (computed, never hand-typed per year).
 * - `lunar`: recurs every year on the same lunar month/day, resolved to a
 *   Gregorian date via `findLunarDateInSolarYear` (see `utils/lunar-calendar.ts`).
 *   `isLeap` restricts the match to a leap month occurrence only (rare —
 *   omit for the normal case).
 * - `lunar-range`: like `lunar`, but spans `days` Gregorian days forward from
 *   the resolved date (e.g. Tết Nguyên Đán's multi-day window).
 */
export type HolidayDateRule =
  | { readonly kind: 'fixed'; readonly month: number; readonly day: number }
  | {
      /** Recurring Gregorian range, e.g. Christmas Eve + Christmas Day. */
      readonly kind: 'fixed-range';
      readonly month: number;
      readonly day: number;
      readonly days: number;
    }
  | {
      readonly kind: 'explicit';
      readonly ranges: ReadonlyArray<{
        readonly year: number;
        /** Inclusive, format YYYY-MM-DD. */
        readonly start: string;
        /** Inclusive, format YYYY-MM-DD. */
        readonly end: string;
      }>;
    }
  | {
      readonly kind: 'lunar';
      readonly month: number;
      readonly day: number;
      readonly isLeap?: boolean;
    }
  | {
      readonly kind: 'lunar-range';
      readonly month: number;
      readonly day: number;
      /** Total days in the window, including the resolved start date. */
      readonly days: number;
      readonly isLeap?: boolean;
    }
  | {
      /** The last day of a lunar month (29 or 30, whichever the month
       *  actually has that cycle) — used for Tất niên (tháng Chạp = 12). */
      readonly kind: 'lunar-month-end';
      readonly month: number;
      readonly isLeap?: boolean;
    };

/** How the (few, small) foreground decorative shapes drift. */
export type HolidayParticleAnimation = 'fall' | 'float' | 'burst' | 'twinkle';

export interface HolidayDecoration {
  /** Emoji cycled through for the floating foreground layer (fireworks, snow, hearts...). */
  readonly particleEmoji?: readonly string[];
  readonly particleAnimation: HolidayParticleAnimation;
  /** Defaults to 0 (no floating particles) when omitted. */
  readonly particleCount?: number;
}

/**
 * A small, reusable set of layered visual "scenes" — each one is a whole
 * background-glow + decorative-layer + focal-shape composition (see
 * `holiday-visual.html`), not a single icon. Holidays sharing an archetype
 * still read as distinct via `variant`/`rotation`/`ribbonAngle` + their own
 * theme colors — see `data/holidays.data.ts` for how each holiday is mapped.
 */
export type HolidayArchetype =
  | 'star-emblem'
  | 'floral-arrangement'
  | 'tree-scene'
  | 'moon-scene'
  | 'heart-bloom'
  | 'midnight-sparkle'
  | 'geometric-abstract'
  | 'tet-branch-scene'
  | 'dong-son-drum-scene'
  | 'vietnam-flag-scene'
  | 'labor-day-scene'
  | 'national-day-scene'
  | 'new-year-scene';

export interface HolidayComposition {
  readonly archetype: HolidayArchetype;
  /** Degrees, applied to the whole focal shape for asymmetric composition. */
  readonly rotation?: number;
  /** Degrees, orients the decorative ribbon/fold layer independently. */
  readonly ribbonAngle?: number;
  /** Picks a silhouette variant within an archetype (e.g. medal vs. plain star). */
  readonly variant?: string;
}

export interface HolidayTheme {
  /** CSS `background` value (solid color or gradient) for the content area.
   *  Still used as the base color behind `backgroundImage` (visible while it
   *  loads, and through its scrim) and as the only background when omitted. */
  readonly background: string;
  /** Accent color used for the focal shape and small highlights. */
  readonly accent: string;
  readonly textColor: string;
  readonly subtitleColor: string;
  readonly composition: HolidayComposition;
  readonly decoration: HolidayDecoration;
  /** Optional photo shown blurred behind the popup content (path under
   *  `public/`, e.g. `/assets/holidays/tet-nguyen-dan.jpg`). Missing file =
   *  broken `background-image` = silently falls back to `background`, so
   *  it's safe to set before the file exists. */
  readonly backgroundImage?: string;
}

/** Optional badge shown under the motif. `HolidayType` → display label is
 *  resolved per-locale via i18n keys (`holiday.typeLeLon` …) at each surface
 *  that renders the badge; there is no hard-coded label map. */
export type HolidayType = 'le-lon' | 'ky-niem' | 'quoc-te' | 'le-hoi';

export interface HolidayContent {
  /** Supports `{year}` / `{nextYear}` placeholders, resolved at render time. */
  readonly title: string;
  /** Short greeting line. Supports `{year}` / `{nextYear}` placeholders. */
  readonly subtitle?: string;
  /** English variants, shown when the app's display language is English.
   *  Falls back to `title`/`subtitle` when omitted. */
  readonly titleEn?: string;
  readonly subtitleEn?: string;
}

export interface Holiday {
  /** Stable identifier, also used as the localStorage dismissal key. */
  readonly id: string;
  /** Plain descriptive label (e.g. "Tết Nguyên Đán", "Giỗ Tổ Hùng Vương") —
   *  used for calendar badges/agenda rows/tooltips. Distinct from
   *  `content.title`, which is festive popup copy (e.g. "Chúc Mừng Năm
   *  Mới") and not always suitable outside the popup. */
  readonly name: string;
  /** English variant of `name`, shown when the app language is English.
   *  Falls back to `name` when omitted. Resolve via `holidayName()`. */
  readonly nameEn?: string;
  readonly priority: HolidayPriority;
  readonly dateRule: HolidayDateRule;
  readonly type?: HolidayType;
  /** Falls back to `DEFAULT_HOLIDAY_THEME` when omitted. */
  readonly theme?: HolidayTheme;
  readonly content: HolidayContent;
  /** Nghỉ lễ chính thức — surfaced on the read-only "Ngày lễ ở Việt Nam"
   *  reference calendar and the ⭐ badge in agenda-view (spec §29). */
  readonly officialHoliday?: boolean;
  /** Only these holidays show the auto full-screen popup; the rest still get
   *  a theme + calendar badge. Defaults to `false` when omitted. */
  readonly popupEnabled?: boolean;
}

/** Used when a `Holiday` entry doesn't define its own `theme`. */
export const DEFAULT_HOLIDAY_THEME: HolidayTheme = {
  background: 'var(--color-surface)',
  accent: 'var(--color-accent)',
  textColor: 'var(--color-text)',
  subtitleColor: 'var(--color-text-secondary)',
  composition: { archetype: 'geometric-abstract' },
  decoration: {
    particleAnimation: 'twinkle',
  },
};

/**
 * Solid, single-accent theme for the ~30 "minor" holidays that don't warrant
 * a bespoke composition/decoration (spec: "ngày ít quan trọng hơn không cần
 * theme cực kỳ phức tạp — Base UI + Accent color + icon nhỏ"). Colors are
 * grouped by `HolidayType` rather than per-holiday so the palette stays small
 * and predictable; `background`/text stay on the normal surface tokens so
 * these never look like a full re-theme, only a colored accent + icon.
 */
const GENERIC_THEME_ACCENT: Record<HolidayType, string> = {
  'le-lon': '#b91c1c',
  'ky-niem': '#92400e',
  'quoc-te': '#0e7490',
  'le-hoi': '#a21caf',
};

export function resolveGenericHolidayTheme(type?: HolidayType): HolidayTheme {
  const accent = type ? GENERIC_THEME_ACCENT[type] : undefined;
  if (!accent) return DEFAULT_HOLIDAY_THEME;
  return {
    background: 'var(--color-surface)',
    accent,
    textColor: 'var(--color-text)',
    subtitleColor: 'var(--color-text-secondary)',
    composition: { archetype: 'geometric-abstract' },
    decoration: { particleAnimation: 'twinkle' },
  };
}
