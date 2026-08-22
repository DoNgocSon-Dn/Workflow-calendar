/**
 * Accurate Vietnamese Lunar Calendar converter based on Dr. Ho Ngoc Duc's algorithm (UTC+7).
 */

function INT(d: number): number {
  return Math.floor(d);
}

function jdFromDate(dd: number, mm: number, yy: number): number {
  let a = INT((14 - mm) / 12);
  let y = yy + 4800 - a;
  let m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

function getNewMoonDay(k: number, timeZone = 7): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;

  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);

  let M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  let Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  let F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;

  let C1 =
    (0.1734 - 0.000393 * T) * Math.sin(M * dr) +
    0.0021 * Math.sin(2 * M * dr) -
    0.4068 * Math.sin(Mpr * dr) +
    0.0161 * Math.sin(2 * Mpr * dr) -
    0.0004 * Math.sin(3 * Mpr * dr) +
    0.0104 * Math.sin(2 * F * dr) -
    0.0051 * Math.sin((M + Mpr) * dr) -
    0.0074 * Math.sin((M - Mpr) * dr) +
    0.0004 * Math.sin((2 * F + M) * dr) -
    0.0004 * Math.sin((2 * F - M) * dr) -
    0.0006 * Math.sin((2 * F + Mpr) * dr) +
    0.001 * Math.sin((2 * F - Mpr) * dr) +
    0.0005 * Math.sin((M + 2 * Mpr) * dr);

  let deltaT = 0;
  if (T < -11) {
    deltaT = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3;
  } else if (T < 0) {
    deltaT = -0.00002 + 0.000297 * T + 0.000276 * T2;
  }
  let JdNew = Jd1 + C1 - deltaT;
  return INT(JdNew + 0.5 + timeZone / 24);
}

function getSunLongitude(dayNumber: number, timeZone = 7): number {
  let T = (dayNumber - 2451545.5 - timeZone / 24) / 36525;
  let T2 = T * T;
  let dr = Math.PI / 180;
  let M = 357.5291 + 35999.0503 * T - 0.0001559 * T2;
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
  let DL =
    (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(M * dr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M * dr) +
    0.000289 * Math.sin(3 * M * dr);
  let L = L0 + DL;
  L = L - 360 * Math.floor(L / 360);
  return INT(L / 30);
}

function getLunarMonth11(yy: number, timeZone = 7): number {
  let off = jdFromDate(31, 12, yy) - 2415021;
  let k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  let sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

// Finds which of the (up to 14) months between two "month 11"s has no major
// solar term — that's the intercalary/leap month for years with 13 lunar
// months.
function getLeapMonthOffset(a11: number, timeZone = 7): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = getSunLongitude(getNewMoonDay(k + 1, timeZone), timeZone);
  let i = 1;
  let arc = last;
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeap: boolean;
  displayText: string;
  holidayTitle?: string | null;
}

export interface LunarHoliday {
  lunarDay: number;
  lunarMonth: number;
  title: string;
  description: string;
}

export const VIETNAM_LUNAR_HOLIDAYS: LunarHoliday[] = [
  { lunarDay: 1, lunarMonth: 1, title: '🧧 Mùng 1 Tết Nguyên Đán', description: 'Tết Âm lịch - Khởi đầu năm mới' },
  { lunarDay: 2, lunarMonth: 1, title: '🧧 Mùng 2 Tết Nguyên Đán', description: 'Tết Âm lịch' },
  { lunarDay: 3, lunarMonth: 1, title: '🧧 Mùng 3 Tết Nguyên Đán', description: 'Tết Cần Cáo / Tết Thầy Cô' },
  { lunarDay: 15, lunarMonth: 1, title: '🏮 Tết Nguyên Tiêu (Rằm Tháng Giêng)', description: 'Lễ Phật & Cầu an đầu năm' },
  { lunarDay: 3, lunarMonth: 3, title: '🍡 Tết Hàn Thực', description: 'Bánh trôi bánh chay (3/3 Âm lịch)' },
  { lunarDay: 10, lunarMonth: 3, title: '👑 Giỗ Tổ Hùng Vương', description: 'Ngày Quốc lễ Âm lịch (10/3 Âm lịch)' },
  { lunarDay: 15, lunarMonth: 4, title: '🪷 Lễ Phật Đản', description: 'Rằm tháng 4 - Kỷ niệm Đức Phật đản sinh' },
  { lunarDay: 5, lunarMonth: 5, title: '🌾 Tết Đoan Ngọ', description: 'Tết diệt sâu bọ (5/5 Âm lịch)' },
  { lunarDay: 15, lunarMonth: 7, title: '🕯️ Lễ Vu Lan & Xá Tội Vong Nhân', description: 'Rằm tháng 7 - Báo hiếu cha mẹ' },
  { lunarDay: 15, lunarMonth: 8, title: '🥮 Tết Trung Thu', description: 'Rằm tháng 8 - Tết Đoàn Viên & Trông trăng' },
  { lunarDay: 9, lunarMonth: 9, title: '🌼 Tết Trùng Cửu', description: 'Tết Song Cửu (9/9 Âm lịch)' },
  { lunarDay: 15, lunarMonth: 10, title: '🌾 Tết Hạ Nguyên', description: 'Rằm tháng 10 - Cơm mới tạ ơn' },
  { lunarDay: 23, lunarMonth: 12, title: '🐟 Tết Ông Công Ông Táo', description: 'Cúng Táo Quân về trời (23/12 Âm lịch)' },
  { lunarDay: 30, lunarMonth: 12, title: '🎆 Đêm Giao Thừa Âm Lịch', description: 'Đón mừng năm mới Âm lịch' },
];

export function getLunarHoliday(lunarDay: number, lunarMonth: number): string | null {
  const found = VIETNAM_LUNAR_HOLIDAYS.find(
    (h) => h.lunarDay === lunarDay && h.lunarMonth === lunarMonth,
  );
  if (found) return found.title;
  if (lunarDay === 1) return `🌱 Mùng 1 Tháng ${lunarMonth} (Âm lịch)`;
  if (lunarDay === 15) return `🌕 Ngày Rằm Tháng ${lunarMonth} (Âm lịch)`;
  return null;
}

export function convertSolarToLunar(date: Date, timeZone = 7): LunarDate {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let dayNumber = jdFromDate(day, month, year);
  let k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);

  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }

  let a11 = getLunarMonth11(year, timeZone);
  let b11 = a11;

  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = getLunarMonth11(year - 1, timeZone);
  } else {
    lunarYear = year + 1;
    b11 = getLunarMonth11(year + 1, timeZone);
  }

  let lunarDay = dayNumber - monthStart + 1;
  let diff = INT((monthStart - a11) / 29);
  let lunarMonth = diff + 11;
  let isLeap = false;

  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) {
        isLeap = true;
      }
    }
  }

  if (lunarMonth > 12) {
    lunarMonth = lunarMonth - 12;
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }

  let displayText = `${lunarDay}`;
  if (lunarDay === 1) {
    displayText = `${lunarDay}/${lunarMonth}Âm`;
  } else if (lunarDay === 15) {
    displayText = `15 (Rằm)`;
  }

  const holidayTitle = getLunarHoliday(lunarDay, lunarMonth);

  return {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    isLeap,
    displayText,
    holidayTitle,
  };
}
