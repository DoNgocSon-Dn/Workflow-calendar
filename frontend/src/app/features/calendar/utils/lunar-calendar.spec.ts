import { describe, expect, it } from 'vitest';
import { convertSolarToLunar, lunarCellLabel, LunarDate } from './lunar-calendar';

/**
 * `lunarCellLabel` là phần SỐ hiển thị ở góc ô lịch tháng/tuần. Chữ "ÂL" và
 * màu phân biệt với ngày dương do template/CSS lo — hàm này chỉ lo con số.
 */
describe('lunarCellLabel', () => {
  const base: LunarDate = { day: 7, month: 6, year: 2025, isLeap: false, displayText: '' };

  it('ngày thường: chỉ số ngày âm', () => {
    expect(lunarCellLabel({ ...base, day: 7 })).toBe('7');
    expect(lunarCellLabel({ ...base, day: 23 })).toBe('23');
  });

  it('mùng 1: kèm tháng âm để không đọc nhầm là ngày dương', () => {
    expect(lunarCellLabel({ ...base, day: 1, month: 8 })).toBe('1/8');
    expect(lunarCellLabel({ ...base, day: 1, month: 12 })).toBe('1/12');
  });

  it('rằm: vẫn chỉ số ngày (điểm nhấn "rằm" do class .lunar-fifteen tô màu)', () => {
    expect(lunarCellLabel({ ...base, day: 15 })).toBe('15');
  });

  it('khớp với convertSolarToLunar cho một ngày bất kỳ', () => {
    const d = new Date(2025, 5, 15);
    const lunar = convertSolarToLunar(d);
    const expected = lunar.day === 1 ? `1/${lunar.month}` : String(lunar.day);
    expect(lunarCellLabel(lunar)).toBe(expected);
  });
});
