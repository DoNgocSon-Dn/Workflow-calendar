import { Injectable, effect, signal } from '@angular/core';
import { TRANSLATIONS } from './translations';

export type Locale = 'vi' | 'en';

const STORAGE_KEY = 'locale';

function readStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'vi' || stored === 'en' ? stored : 'vi';
}

/**
 * App-wide runtime translation — a plain signal + lookup dictionary rather
 * than a compiled-per-locale i18n setup, so the language switches instantly
 * (no reload, no separate build) the same way theme/density/brand already do.
 *
 * Templates call `i18n.t('namespace.key')` directly; because the signal read
 * happens synchronously during template evaluation, Angular's signal-aware
 * change detection re-renders on locale change without any extra pipe.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly locale = signal<Locale>(readStoredLocale());

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, this.locale());
    });
  }

  setLocale(locale: Locale): void {
    this.locale.set(locale);
  }

  toggle(): void {
    this.locale.update((l) => (l === 'vi' ? 'en' : 'vi'));
  }

  /** Looks up `key` in the current locale's dictionary, falling back to
   *  Vietnamese, then to the raw key so a missing translation never renders
   *  blank. `vars` fills `{name}`-style placeholders in the translated text. */
  t(key: string, vars?: Readonly<Record<string, string | number>>): string {
    const dict = TRANSLATIONS[this.locale()];
    let text = dict[key] ?? TRANSLATIONS.vi[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replace(`{${name}}`, String(value));
      }
    }
    return text;
  }
}
