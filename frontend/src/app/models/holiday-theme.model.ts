/**
 * Data model for the Holiday Popup system. A holiday is fully described by a
 * date rule (when it should appear), a visual theme (colors + decoration),
 * and its display content. Adding a new holiday never requires touching the
 * component or service — see `data/holidays.data.ts`.
 */

/** Lower number = shown first when multiple holidays match the same day. */
export type HolidayPriority = number;

/**
 * When a holiday should be considered "active":
 * - `fixed`: recurs every year on the same Gregorial month/day (most holidays).
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

/** How the floating decorative particles behave. */
export type HolidayParticleAnimation = 'fall' | 'float' | 'burst' | 'twinkle';

/** Small, finite set of inline-SVG motifs reused across holidays. */
export type HolidayCornerMotif = 'star' | 'heart' | 'blossom' | 'snowflake';

export interface HolidayDecoration {
  /** Emoji cycled through for the floating particle layer. */
  readonly particleEmoji: readonly string[];
  readonly particleAnimation: HolidayParticleAnimation;
  /** Defaults to 14 when omitted. */
  readonly particleCount?: number;
  /** Watermark SVG shown in a corner of the popup. Omit for none. */
  readonly cornerMotif?: HolidayCornerMotif;
}

export interface HolidayTheme {
  /** CSS `background` value (solid color or gradient). */
  readonly background: string;
  /** Accent color used for the corner motif and small highlights. */
  readonly accent: string;
  readonly textColor: string;
  readonly subtitleColor: string;
  readonly decoration: HolidayDecoration;
}

export interface HolidayContent {
  /** Headline emoji shown above the title. */
  readonly emoji?: string;
  /** Supports `{year}` / `{nextYear}` placeholders, resolved at render time. */
  readonly title: string;
  /** Supports `{year}` / `{nextYear}` placeholders. */
  readonly subtitle?: string;
}

export interface Holiday {
  /** Stable identifier, also used as the localStorage dismissal key. */
  readonly id: string;
  /** Human-readable label for maintainers (not shown to end users). */
  readonly name: string;
  readonly priority: HolidayPriority;
  readonly dateRule: HolidayDateRule;
  readonly theme: HolidayTheme;
  readonly content: HolidayContent;
}
