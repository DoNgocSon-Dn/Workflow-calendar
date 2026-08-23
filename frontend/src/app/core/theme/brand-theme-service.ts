import { Injectable, effect, signal } from '@angular/core';

/**
 * A "brand theme" only re-skins the accent color ramp — it never touches
 * typography, spacing or shape. Layered independently from `ThemeService`'s
 * light/dark mode via a `data-brand` attribute on `<html>`, so both can be
 * combined freely.
 *
 * The three hues are deliberately picked to avoid the calendar's reserved
 * status colors (red = danger, amber = warning, green = success, pink = live),
 * so an accent never reads as an event state.
 */
export type BrandTheme = 'default' | 'teal' | 'violet';

const STORAGE_KEY = 'brand-theme';
const VALID_THEMES: readonly BrandTheme[] = ['default', 'teal', 'violet'];

function isBrandTheme(value: string | null): value is BrandTheme {
  return value !== null && (VALID_THEMES as readonly string[]).includes(value);
}

function readStoredBrandTheme(): BrandTheme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isBrandTheme(stored) ? stored : null;
}

@Injectable({ providedIn: 'root' })
export class BrandThemeService {
  readonly brandTheme = signal<BrandTheme>(readStoredBrandTheme() ?? 'default');

  constructor() {
    effect(() => {
      const theme = this.brandTheme();
      if (theme === 'default') {
        document.documentElement.removeAttribute('data-brand');
      } else {
        document.documentElement.setAttribute('data-brand', theme);
      }
      localStorage.setItem(STORAGE_KEY, theme);
    });
  }

  setBrandTheme(theme: BrandTheme): void {
    this.brandTheme.set(theme);
  }
}
