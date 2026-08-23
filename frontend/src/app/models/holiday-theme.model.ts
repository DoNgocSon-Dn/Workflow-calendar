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
 * - `explicit`: a per-year curated list of date ranges. Used for lunar-based
 *   holidays (Tết Nguyên Đán) where the Gregorian date shifts every year and
 *   must never be guessed — only dates explicitly configured here are used.
 */
export type HolidayDateRule =
  | { readonly kind: 'fixed'; readonly month: number; readonly day: number }
  | {
      readonly kind: 'explicit';
      readonly ranges: ReadonlyArray<{
        readonly year: number;
        /** Inclusive, format YYYY-MM-DD. */
        readonly start: string;
        /** Inclusive, format YYYY-MM-DD. */
        readonly end: string;
      }>;
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
  | 'geometric-abstract';

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
  /** CSS `background` value (solid color or gradient) for the content area. */
  readonly background: string;
  /** Accent color used for the focal shape and small highlights. */
  readonly accent: string;
  readonly textColor: string;
  readonly subtitleColor: string;
  readonly composition: HolidayComposition;
  readonly decoration: HolidayDecoration;
}

/** Optional badge shown under the motif. */
export type HolidayType = 'le-lon' | 'ky-niem' | 'quoc-te' | 'le-hoi';

/** Vietnamese label for each `HolidayType` — shared by every surface that
 *  renders the badge (auto-popup, calendar event info card, ...). */
export const HOLIDAY_TYPE_LABEL: Record<HolidayType, string> = {
  'le-lon': 'Lễ lớn',
  'ky-niem': 'Ngày kỷ niệm',
  'quoc-te': 'Ngày quốc tế',
  'le-hoi': 'Lễ hội',
};

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
  /** Human-readable label for maintainers (not shown to end users). */
  readonly name: string;
  readonly priority: HolidayPriority;
  readonly dateRule: HolidayDateRule;
  readonly type?: HolidayType;
  /** Falls back to `DEFAULT_HOLIDAY_THEME` when omitted. */
  readonly theme?: HolidayTheme;
  readonly content: HolidayContent;
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
