import { Injectable, effect, signal } from '@angular/core';

/**
 * A "brand theme" only re-skins color/shape/elevation tokens (accent color,
 * corner radius scale, shadow tiers) — it never touches typography. Layered
 * independently from `ThemeService`'s light/dark mode via a `data-brand`
 * attribute on `<html>`, so both can be combined freely.
 */
export type BrandTheme = 'default' | 'airbnb' | 'mintlify' | 'supabase' | 'vercel';

const STORAGE_KEY = 'brand-theme';
const VALID_THEMES: readonly BrandTheme[] = ['default', 'airbnb', 'mintlify', 'supabase', 'vercel'];

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
