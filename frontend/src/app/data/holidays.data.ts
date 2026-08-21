import { HolidayTheme } from '../models/holiday-theme.model';

/**
 * Ngày dương lịch của Tết Nguyên Đán theo từng năm — lịch âm có tháng nhuận
 * nên không tính bằng công thức cố định, chỉ liệt kê năm đã tra cứu chắc chắn.
 * Cần bổ sung khi sang năm mới (đồng bộ với vietnam-holidays.ts của lịch).
 */
const TET_NGUYEN_DAN_DATES: Readonly<Record<number, readonly [number, number]>> = {
  2024: [2, 10],
  2025: [1, 29],
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
};

/**
 * Ngày dương lịch của Giỗ Tổ Hùng Vương (10/3 âm lịch) theo từng năm — cùng lý
 * do như Tết, cần tra cứu thủ công. Đồng bộ với vietnam-holidays.ts của lịch.
 */
const HUNG_KINGS_DATES: Readonly<Record<number, readonly [number, number]>> = {
  2024: [4, 18],
  2025: [4, 7],
  2026: [4, 26],
};

export const HOLIDAY_THEMES: readonly HolidayTheme[] = [
  {
    id: 'new-year-solar',
    priority: 5,
    dateRule: { kind: 'fixed', month: 1, day: 1 },
    icon: '🎉',
    decorations: ['fireworks', 'confetti'],
    colors: {
      background: 'linear-gradient(160deg, #1a1a4e 0%, #2d2b6b 45%, #4a3f8c 100%)',
      accent: '#ffd166',
      accentSoft: 'rgba(255, 209, 102, 0.18)',
      text: '#fdf6e3',
    },
    getContent: ({ date }) => ({
      title: 'Chúc mừng năm mới!',
      subtitle: `Chào đón năm ${date.getFullYear()} tràn đầy may mắn và thành công.`,
    }),
  },
  {
    id: 'tet-nguyen-dan',
    priority: 1,
    dateRule: { kind: 'yearly-map', datesByYear: TET_NGUYEN_DAN_DATES, durationDays: 3 },
    icon: '🧧',
    decorations: ['blossom', 'lucky-envelope', 'fireworks'],
    colors: {
      background: 'linear-gradient(160deg, #7a0c0c 0%, #b3141a 55%, #d4af37 130%)',
      accent: '#ffd700',
      accentSoft: 'rgba(255, 215, 0, 0.2)',
      text: '#fff6e0',
    },
    getContent: () => ({
      title: 'Chúc mừng năm mới',
      subtitle: 'An khang - Thịnh vượng - Vạn sự như ý',
    }),
  },
  {
    id: 'hung-kings-day',
    priority: 5,
    dateRule: { kind: 'yearly-map', datesByYear: HUNG_KINGS_DATES },
    icon: '🥁',
    decorations: [],
    colors: {
      background: 'linear-gradient(160deg, #3f2410 0%, #6b3a16 55%, #3f2410 100%)',
      accent: '#d9a441',
      accentSoft: 'rgba(217, 164, 65, 0.16)',
      text: '#f6ead2',
    },
    getContent: () => ({
      title: 'Giỗ Tổ Hùng Vương',
      subtitle: 'Dù ai đi ngược về xuôi / Nhớ ngày Giỗ Tổ mùng mười tháng ba',
    }),
  },
  {
    id: 'womens-day',
    priority: 5,
    dateRule: { kind: 'fixed', month: 3, day: 8 },
    icon: '',
    decorations: ['petals'],
    colors: {
      background: 'linear-gradient(160deg, #ffe3ec 0%, #ffd0e0 50%, #ffc2d6 100%)',
      accent: '#e85d8f',
      accentSoft: 'rgba(232, 93, 143, 0.15)',
      text: '#7a2545',
    },
    getContent: () => ({
      title: 'Chúc mừng Ngày Quốc tế Phụ nữ 8/3',
      subtitle: 'Chúc các bạn nữ luôn xinh đẹp, hạnh phúc và thành công.',
    }),
  },
  {
    id: 'liberation-day',
    priority: 5,
    dateRule: { kind: 'fixed', month: 4, day: 30 },
    icon: '🇻🇳',
    decorations: ['gold-star'],
    colors: {
      background: 'linear-gradient(160deg, #8c0f0f 0%, #b3141a 60%, #7a0c0c 100%)',
      accent: '#ffd700',
      accentSoft: 'rgba(255, 215, 0, 0.16)',
      text: '#fff3e0',
    },
    getContent: () => ({
      title: 'Kỷ niệm Ngày Giải phóng miền Nam, thống nhất đất nước',
      subtitle: '30/4 — Non sông thu về một mối.',
    }),
  },
  {
    id: 'labor-day',
    priority: 5,
    dateRule: { kind: 'fixed', month: 5, day: 1 },
    icon: '⚙️',
    decorations: [],
    colors: {
      background: 'linear-gradient(160deg, #1f2937 0%, #374151 60%, #1f2937 100%)',
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.16)',
      text: '#f3f4f6',
    },
    getContent: () => ({
      title: 'Chúc mừng Ngày Quốc tế Lao động 1/5',
      subtitle: 'Cảm ơn những nỗ lực và cống hiến mỗi ngày.',
    }),
  },
  {
    id: 'national-day',
    priority: 3,
    dateRule: { kind: 'fixed', month: 9, day: 2 },
    icon: '',
    decorations: ['gold-star', 'fireworks'],
    colors: {
      background: 'linear-gradient(160deg, #8c0f0f 0%, #b3141a 55%, #8c0f0f 100%)',
      accent: '#ffd700',
      accentSoft: 'rgba(255, 215, 0, 0.18)',
      text: '#fff3e0',
    },
    getContent: () => ({
      title: 'Chào mừng Quốc khánh Việt Nam 2/9',
      subtitle: 'Độc lập - Tự do - Hạnh phúc',
    }),
  },
  {
    id: 'teachers-day',
    priority: 5,
    dateRule: { kind: 'fixed', month: 11, day: 20 },
    icon: '🍎',
    decorations: ['books'],
    colors: {
      background: 'linear-gradient(160deg, #7c4a1e 0%, #a8672e 55%, #c98a3f 100%)',
      accent: '#ffcf70',
      accentSoft: 'rgba(255, 207, 112, 0.18)',
      text: '#fff3e0',
    },
    getContent: () => ({
      title: 'Chúc mừng Ngày Nhà giáo Việt Nam 20/11',
      subtitle: 'Tri ân thầy cô — những người lái đò thầm lặng.',
    }),
  },
  {
    id: 'army-day',
    priority: 5,
    dateRule: { kind: 'fixed', month: 12, day: 22 },
    icon: '🎖️',
    decorations: ['gold-star'],
    colors: {
      background: 'linear-gradient(160deg, #1a2e1a 0%, #2d4a2d 55%, #1a2e1a 100%)',
      accent: '#ffd700',
      accentSoft: 'rgba(255, 215, 0, 0.14)',
      text: '#f0f5ec',
    },
    getContent: () => ({
      title: 'Kỷ niệm Ngày thành lập Quân đội Nhân dân Việt Nam',
      subtitle: '22/12 — Bộ đội Cụ Hồ, vì nhân dân quên mình.',
    }),
  },
  {
    id: 'valentine',
    priority: 5,
    dateRule: { kind: 'fixed', month: 2, day: 14 },
    icon: '💘',
    decorations: ['hearts'],
    colors: {
      background: 'linear-gradient(160deg, #ff8fab 0%, #ff4d6d 55%, #c9184a 100%)',
      accent: '#fff0f3',
      accentSoft: 'rgba(255, 255, 255, 0.2)',
      text: '#fff0f3',
    },
    getContent: () => ({
      title: "Happy Valentine's Day ❤️",
      subtitle: 'Chúc bạn một ngày lễ tình nhân thật ngọt ngào.',
    }),
  },
  {
    id: 'halloween',
    priority: 5,
    dateRule: { kind: 'fixed', month: 10, day: 31 },
    icon: '🎃',
    decorations: ['pumpkin-patch'],
    colors: {
      background: 'linear-gradient(160deg, #150a24 0%, #2b1140 55%, #150a24 100%)',
      accent: '#ff8a2b',
      accentSoft: 'rgba(255, 138, 43, 0.18)',
      text: '#f3e8ff',
    },
    getContent: () => ({
      title: 'Happy Halloween 🎃',
      subtitle: 'Trick or treat! Chúc bạn một đêm Halloween ma mị.',
    }),
  },
  {
    id: 'christmas',
    priority: 2,
    dateRule: { kind: 'fixed', month: 12, day: 25 },
    icon: '🎄',
    decorations: ['snow', 'christmas-tree'],
    colors: {
      background: 'linear-gradient(160deg, #0b3d24 0%, #14532d 55%, #7a1626 130%)',
      accent: '#ffd166',
      accentSoft: 'rgba(255, 209, 102, 0.18)',
      text: '#fdf6e3',
    },
    getContent: () => ({
      title: 'Merry Christmas 🎄',
      subtitle: 'Chúc bạn và gia đình một mùa Giáng sinh ấm áp.',
    }),
  },
  {
    id: 'new-year-eve',
    priority: 4,
    dateRule: { kind: 'fixed', month: 12, day: 31 },
    icon: '🥂',
    decorations: ['fireworks', 'confetti'],
    colors: {
      background: 'linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #24243e 100%)',
      accent: '#ffd166',
      accentSoft: 'rgba(255, 209, 102, 0.18)',
      text: '#fdf6e3',
    },
    getContent: ({ date }) => {
      const year = date.getFullYear();
      return {
        title: `Goodbye ${year} - Welcome ${year + 1}`,
        subtitle: 'Cùng đếm ngược chào đón năm mới!',
      };
    },
  },
];
