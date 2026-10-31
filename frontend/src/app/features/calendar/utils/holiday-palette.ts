import { Holiday, HolidayType } from '../../../models/holiday-theme.model';

const ACCENTS: Record<HolidayType, string> = {
  'le-lon': '#b91c1c', 'ky-niem': '#92400e', 'quoc-te': '#0e7490', 'le-hoi': '#a21caf',
};

function luminance(rgb: number[]): number {
  const c = rgb.map((value) => {
    const s = value / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}

/** Readable accents for every holiday, including entries without custom CSS. */
export function holidayPalette(holiday: Holiday): { light: string; dark: string } {
  const accent = holiday.theme?.accent ?? ACCENTS[holiday.type ?? 'le-hoi'];
  const hex = /^#[0-9a-f]{6}$/i.test(accent) ? accent : ACCENTS[holiday.type ?? 'le-hoi'];
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const resolve = (dark: boolean) => {
    const background = dark ? luminance([22, 25, 34]) : 1;
    let next = [...rgb];
    for (let i = 0; i < 100; i++) {
      const l = luminance(next);
      if ((Math.max(l, background) + .05) / (Math.min(l, background) + .05) >= 4.5) break;
      next = next.map((v) => Math.round(dark ? v + (255 - v) * .08 : v * .92));
    }
    return '#' + next.map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  return { light: resolve(false), dark: resolve(true) };
}
