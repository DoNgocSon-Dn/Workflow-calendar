/**
 * Kiểu dữ liệu và nhãn hiển thị cho tính năng lặp lại sự kiện.
 *
 * Khớp 1-1 với RecurrenceRuleDto ở backend (backend/src/events/dto/recurrence-rule.dto.ts)
 * — hai phía không share code (frontend/backend là hai dự án TS tách biệt,
 * không có package dùng chung trong repo này), nên phần toán ngày/tuần nhỏ ở
 * đây được lặp lại có chủ đích thay vì cố gắng dùng chung.
 */

import { Locale } from '../../../core/i18n/translation.service';

export type RecurrenceFreq =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'monthly_nth_weekday'
  | 'monthly_last_weekday'
  | 'yearly'
  | 'weekdays'
  | 'custom';

export type RecurrenceEndType = 'never' | 'until' | 'count';
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval?: number;
  unit?: RecurrenceUnit;
  byWeekdays?: number[];
  endType?: RecurrenceEndType;
  until?: string;
  count?: number;
}

export interface RecurrenceOption {
  rule: RecurrenceRule | null;
  label: string;
}

const NTH_LABEL_VI = ['', 'đầu tiên', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm'];
const NTH_LABEL_EN = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

export function weekOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

export function isLastWeekdayOfMonth(date: Date): boolean {
  const next = new Date(date);
  next.setDate(next.getDate() + 7);
  return next.getMonth() !== date.getMonth();
}

function weekdayName(date: Date, locale: Locale, form: 'long' | 'short' = 'long'): string {
  const intlLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  return new Intl.DateTimeFormat(intlLocale, { weekday: form }).format(date);
}

function monthDayLabel(date: Date, locale: Locale): string {
  if (locale === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date);
  }
  return `ngày ${date.getDate()} tháng ${date.getMonth() + 1}`;
}

/** Danh sách tuỳ chọn cho dropdown "Lặp lại", tính động theo ngày bắt đầu — khớp Google Calendar. */
export function buildPresetOptions(startDate: Date, locale: Locale): RecurrenceOption[] {
  const weekday = weekdayName(startDate, locale);
  const dayOfMonth = startDate.getDate();
  const options: RecurrenceOption[] = [
    { rule: null, label: locale === 'en' ? 'Does not repeat' : 'Không lặp lại' },
    { rule: { freq: 'daily' }, label: locale === 'en' ? 'Daily' : 'Hàng ngày' },
    {
      rule: { freq: 'weekly' },
      label:
        locale === 'en' ? `Weekly on ${weekday}` : `Hàng tuần vào ${weekday.toLowerCase()}`,
    },
    {
      rule: { freq: 'monthly' },
      label:
        locale === 'en'
          ? `Monthly on day ${dayOfMonth}`
          : `Hàng tháng vào ngày ${dayOfMonth}`,
    },
  ];

  const nth = weekOfMonth(startDate);
  if (nth <= 4) {
    const nthLabel = locale === 'en' ? NTH_LABEL_EN[nth] : NTH_LABEL_VI[nth];
    options.push({
      rule: { freq: 'monthly_nth_weekday' },
      label:
        locale === 'en'
          ? `Monthly on the ${nthLabel} ${weekday}`
          : `Hàng tháng vào ${weekday.toLowerCase()} ${nthLabel}`,
    });
  }
  if (isLastWeekdayOfMonth(startDate)) {
    options.push({
      rule: { freq: 'monthly_last_weekday' },
      label:
        locale === 'en'
          ? `Monthly on the last ${weekday}`
          : `Hàng tháng vào ${weekday.toLowerCase()} cuối cùng`,
    });
  }

  options.push({
    rule: { freq: 'yearly' },
    label:
      locale === 'en'
        ? `Annually on ${monthDayLabel(startDate, locale)}`
        : `Hàng năm vào ${monthDayLabel(startDate, locale)}`,
  });

  const dow = startDate.getDay();
  if (dow >= 1 && dow <= 5) {
    options.push({
      rule: { freq: 'weekdays' },
      label: locale === 'en' ? 'Every weekday (Monday to Friday)' : 'Mọi ngày trong tuần (từ Thứ Hai tới Thứ Sáu)',
    });
  }

  options.push({ rule: { freq: 'custom' }, label: locale === 'en' ? 'Custom…' : 'Tuỳ chỉnh…' });

  return options;
}

/** Tóm tắt một dòng cho quy tắc đã có — dùng khi sửa sự kiện thuộc một chuỗi lặp (chỉ hiển thị, không sửa được). */
export function describeRecurrence(rule: RecurrenceRule, startDate: Date, locale: Locale): string {
  const weekday = weekdayName(startDate, locale);
  const dayOfMonth = startDate.getDate();
  switch (rule.freq) {
    case 'daily':
      return locale === 'en' ? 'Daily' : 'Hàng ngày';
    case 'weekly':
      return locale === 'en' ? `Weekly on ${weekday}` : `Hàng tuần vào ${weekday.toLowerCase()}`;
    case 'monthly':
      return locale === 'en'
        ? `Monthly on day ${dayOfMonth}`
        : `Hàng tháng vào ngày ${dayOfMonth}`;
    case 'monthly_nth_weekday': {
      const nth = weekOfMonth(startDate);
      const nthLabel = locale === 'en' ? NTH_LABEL_EN[nth] ?? '' : NTH_LABEL_VI[nth] ?? '';
      return locale === 'en'
        ? `Monthly on the ${nthLabel} ${weekday}`
        : `Hàng tháng vào ${weekday.toLowerCase()} ${nthLabel}`;
    }
    case 'monthly_last_weekday':
      return locale === 'en' ? `Monthly on the last ${weekday}` : `Hàng tháng vào ${weekday.toLowerCase()} cuối cùng`;
    case 'yearly':
      return locale === 'en'
        ? `Annually on ${monthDayLabel(startDate, locale)}`
        : `Hàng năm vào ${monthDayLabel(startDate, locale)}`;
    case 'weekdays':
      return locale === 'en' ? 'Every weekday (Monday to Friday)' : 'Mọi ngày trong tuần (từ Thứ Hai tới Thứ Sáu)';
    case 'custom': {
      const interval = rule.interval ?? 1;
      const unit = rule.unit ?? 'week';
      const unitLabel = customUnitLabel(unit, interval, locale);
      let base = locale === 'en' ? `Every ${interval} ${unitLabel}` : `${interval} ${unitLabel} một lần`;
      if (unit === 'week' && rule.byWeekdays && rule.byWeekdays.length > 0) {
        const names = rule.byWeekdays
          .slice()
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
          .map((wd) => weekdayName(dateForWeekday(wd), locale, 'short'))
          .join(', ');
        base += locale === 'en' ? ` on ${names}` : ` vào ${names}`;
      }
      if (rule.endType === 'until' && rule.until) {
        base += locale === 'en' ? `, until ${rule.until}` : `, đến ${rule.until}`;
      } else if (rule.endType === 'count' && rule.count) {
        base +=
          locale === 'en'
            ? `, ${rule.count} time${rule.count > 1 ? 's' : ''}`
            : `, ${rule.count} lần`;
      }
      return base;
    }
    default:
      return '';
  }
}

function customUnitLabel(unit: RecurrenceUnit, count: number, locale: Locale): string {
  if (locale === 'en') {
    const base = { day: 'day', week: 'week', month: 'month', year: 'year' }[unit];
    return count > 1 ? `${base}s` : base;
  }
  return { day: 'ngày', week: 'tuần', month: 'tháng', year: 'năm' }[unit];
}

function dateForWeekday(weekday: number): Date {
  // Bất kỳ tuần lễ tham chiếu nào cũng được — 2024-01-01 là Thứ Hai.
  const monday = new Date(2024, 0, 1);
  monday.setDate(monday.getDate() + ((weekday + 6) % 7));
  return monday;
}
