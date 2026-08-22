import { Holiday } from '../models/holiday-theme.model';

/**
 * All holiday popup themes. To add a new holiday, append one object here —
 * no other file needs to change. `priority` decides which popup wins when
 * more than one holiday matches the same day (lower number = higher
 * priority), following the order requested by the product owner:
 * Tết Nguyên Đán > Christmas > Quốc khánh > New Year's Eve > everything else.
 */
export const HOLIDAYS: readonly Holiday[] = [
  // Tết Nguyên Đán — lunar new year. The Gregorian date shifts every year,
  // so it is NEVER computed — only the ranges curated below are recognized.
  // Each range covers Giao thừa (đêm 30) through mùng 3. Add the next year's
  // range here when it becomes known; nothing else needs to change.
  {
    id: 'tet-nguyen-dan',
    name: 'Tết Nguyên Đán',
    priority: 5,
    dateRule: {
      kind: 'explicit',
      ranges: [
        { year: 2024, start: '2024-02-09', end: '2024-02-12' },
        { year: 2025, start: '2025-01-28', end: '2025-01-31' },
        { year: 2026, start: '2026-02-16', end: '2026-02-19' },
        { year: 2027, start: '2027-02-05', end: '2027-02-08' },
        { year: 2028, start: '2028-01-25', end: '2028-01-28' },
      ],
    },
    theme: {
      background: 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 45%, #f59e0b 100%)',
      accent: '#fde68a',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.85)',
      decoration: {
        particleEmoji: ['🌸', '🧧', '🌼'],
        particleAnimation: 'float',
        cornerMotif: 'blossom',
      },
    },
    content: {
      emoji: '🧧',
      title: 'Chúc Mừng Năm Mới',
      subtitle: 'An Khang – Thịnh Vượng – Vạn Sự Như Ý',
    },
  },

  // Christmas
  {
    id: 'christmas',
    name: 'Christmas',
    priority: 10,
    dateRule: { kind: 'fixed', month: 12, day: 25 },
    theme: {
      background: 'linear-gradient(135deg, #7f1d1d 0%, #14532d 60%, #052e16 100%)',
      accent: '#facc15',
      textColor: '#f8fafc',
      subtitleColor: 'rgba(248, 250, 252, 0.8)',
      decoration: {
        particleEmoji: ['❄️', '✨'],
        particleAnimation: 'fall',
        cornerMotif: 'snowflake',
      },
    },
    content: {
      emoji: '🎄',
      title: 'Merry Christmas',
      subtitle: 'Giáng sinh an lành bên người thân yêu 🎁',
    },
  },

  // Quốc khánh Việt Nam — 2/9
  {
    id: 'national-day',
    name: 'Quốc khánh Việt Nam',
    priority: 15,
    dateRule: { kind: 'fixed', month: 9, day: 2 },
    theme: {
      background: 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 45%, #ca8a04 100%)',
      accent: '#fde047',
      textColor: '#fffbeb',
      subtitleColor: 'rgba(255, 251, 235, 0.85)',
      decoration: {
        particleEmoji: ['⭐', '🎇'],
        particleAnimation: 'burst',
        cornerMotif: 'star',
      },
    },
    content: {
      emoji: '🇻🇳',
      title: 'Chào mừng Quốc khánh Việt Nam 2/9',
      subtitle: 'Độc lập – Tự do – Hạnh phúc',
    },
  },

  // New Year's Eve — 31/12
  {
    id: 'new-year-eve',
    name: "New Year's Eve",
    priority: 20,
    dateRule: { kind: 'fixed', month: 12, day: 31 },
    theme: {
      background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #be185d 100%)',
      accent: '#fbbf24',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      decoration: {
        particleEmoji: ['🎆', '🥂', '✨'],
        particleAnimation: 'burst',
        cornerMotif: 'star',
      },
    },
    content: {
      emoji: '🎇',
      title: 'Goodbye {year} - Welcome {nextYear}',
      subtitle: 'Cùng đếm ngược chào đón năm mới!',
    },
  },

  // Giải phóng miền Nam — 30/4
  {
    id: 'reunification-day',
    name: 'Giải phóng miền Nam',
    priority: 30,
    dateRule: { kind: 'fixed', month: 4, day: 30 },
    theme: {
      background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 60%, #b91c1c 100%)',
      accent: '#fbbf24',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.8)',
      decoration: {
        particleEmoji: ['⭐'],
        particleAnimation: 'twinkle',
        particleCount: 8,
        cornerMotif: 'star',
      },
    },
    content: {
      emoji: '🇻🇳',
      title: 'Kỷ niệm Ngày Giải phóng miền Nam',
      subtitle: 'Thống nhất đất nước – 30/4',
    },
  },

  // Tết Dương Lịch — 1/1
  {
    id: 'new-year',
    name: 'Tết Dương Lịch',
    priority: 40,
    dateRule: { kind: 'fixed', month: 1, day: 1 },
    theme: {
      background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 45%, #db2777 100%)',
      accent: '#fbbf24',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      decoration: {
        particleEmoji: ['🎆', '✨', '🎉'],
        particleAnimation: 'burst',
        cornerMotif: 'star',
      },
    },
    content: {
      emoji: '🎊',
      title: 'Chúc mừng năm mới {year}!',
      subtitle: 'Chúc bạn một năm mới an khang, hạnh phúc và nhiều thành công!',
    },
  },

  // Ngày thành lập Quân đội Nhân dân Việt Nam — 22/12
  {
    id: 'army-day',
    name: 'Ngày thành lập Quân đội Nhân dân Việt Nam',
    priority: 55,
    dateRule: { kind: 'fixed', month: 12, day: 22 },
    theme: {
      background: 'linear-gradient(135deg, #14532d 0%, #166534 55%, #7f1d1d 100%)',
      accent: '#facc15',
      textColor: '#f0fdf4',
      subtitleColor: 'rgba(240, 253, 244, 0.8)',
      decoration: {
        particleEmoji: ['⭐'],
        particleAnimation: 'twinkle',
        particleCount: 8,
        cornerMotif: 'star',
      },
    },
    content: {
      emoji: '🎖️',
      title: 'Kỷ niệm Ngày thành lập Quân đội Nhân dân Việt Nam',
      subtitle: '22/12 – Tự hào truyền thống anh hùng',
    },
  },

  // Ngày Quốc tế Phụ nữ — 8/3
  {
    id: 'womens-day',
    name: 'Ngày Quốc tế Phụ nữ',
    priority: 60,
    dateRule: { kind: 'fixed', month: 3, day: 8 },
    theme: {
      background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 45%, #fbcfe8 100%)',
      accent: '#db2777',
      textColor: '#831843',
      subtitleColor: '#9d174d',
      decoration: {
        particleEmoji: ['🌷', '🌸', '💐'],
        particleAnimation: 'float',
        cornerMotif: 'blossom',
      },
    },
    content: {
      emoji: '💐',
      title: 'Chúc mừng Ngày Quốc tế Phụ nữ 8/3',
      subtitle: 'Chúc các chị em luôn xinh đẹp, hạnh phúc và tràn đầy yêu thương!',
    },
  },

  // Ngày Nhà giáo Việt Nam — 20/11
  {
    id: 'teachers-day',
    name: 'Ngày Nhà giáo Việt Nam',
    priority: 60,
    dateRule: { kind: 'fixed', month: 11, day: 20 },
    theme: {
      background: 'linear-gradient(135deg, #78350f 0%, #b45309 55%, #f59e0b 100%)',
      accent: '#fef3c7',
      textColor: '#fffbeb',
      subtitleColor: 'rgba(255, 251, 235, 0.85)',
      decoration: {
        particleEmoji: ['📚', '✏️', '🌻'],
        particleAnimation: 'float',
      },
    },
    content: {
      emoji: '🍎',
      title: 'Chúc mừng Ngày Nhà giáo Việt Nam 20/11',
      subtitle: 'Tri ân thầy cô – những người lái đò thầm lặng',
    },
  },

  // Quốc tế Lao động — 1/5
  {
    id: 'labor-day',
    name: 'Quốc tế Lao động',
    priority: 65,
    dateRule: { kind: 'fixed', month: 5, day: 1 },
    theme: {
      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
      accent: '#a5b4fc',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      decoration: {
        particleEmoji: ['✨'],
        particleAnimation: 'twinkle',
        particleCount: 8,
        cornerMotif: 'star',
      },
    },
    content: {
      emoji: '🛠️',
      title: 'Chúc mừng Ngày Quốc tế Lao động 1/5',
    },
  },

  // Valentine's Day — 14/2
  {
    id: 'valentine',
    name: "Valentine's Day",
    priority: 70,
    dateRule: { kind: 'fixed', month: 2, day: 14 },
    theme: {
      background: 'linear-gradient(135deg, #4c0519 0%, #be123c 50%, #fb7185 100%)',
      accent: '#fecdd3',
      textColor: '#fff1f2',
      subtitleColor: 'rgba(255, 241, 242, 0.85)',
      decoration: {
        particleEmoji: ['❤️', '💕', '💖'],
        particleAnimation: 'float',
        cornerMotif: 'heart',
      },
    },
    content: {
      emoji: '💘',
      title: "Happy Valentine's Day",
    },
  },

  // Halloween — 31/10
  {
    id: 'halloween',
    name: 'Halloween',
    priority: 70,
    dateRule: { kind: 'fixed', month: 10, day: 31 },
    theme: {
      background: 'linear-gradient(135deg, #0c0a1a 0%, #3b0764 45%, #c2410c 100%)',
      accent: '#fb923c',
      textColor: '#fde68a',
      subtitleColor: 'rgba(253, 230, 138, 0.8)',
      decoration: {
        particleEmoji: ['🎃', '👻', '🕸️'],
        particleAnimation: 'float',
      },
    },
    content: {
      emoji: '🎃',
      title: 'Happy Halloween',
    },
  },
];
