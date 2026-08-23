import { Holiday } from '../models/holiday-theme.model';

/**
 * All holiday popup themes. To add a new holiday, append one object here —
 * no other file needs to change. Omit `theme` entirely to use
 * `DEFAULT_HOLIDAY_THEME` until bespoke art is ready. `priority` decides
 * which popup wins when more than one holiday matches the same day (lower
 * number = higher priority).
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
    type: 'le-lon',
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
      background: 'linear-gradient(160deg, #3a0a0a 0%, #7f1d1d 55%, #a16207 100%)',
      accent: '#f5c451',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.8)',
      composition: { archetype: 'floral-arrangement', variant: 'tet' },
      decoration: {
        particleEmoji: ['🌸', '🧧', '✨'],
        particleAnimation: 'float',
        particleCount: 14,
      },
    },
    content: {
      title: 'Chúc Mừng Năm Mới',
      subtitle: 'An khang – thịnh vượng – vạn sự như ý',
      titleEn: 'Happy Lunar New Year',
      subtitleEn: 'Health, prosperity, and every wish fulfilled',
    },
  },

  // Quốc khánh Việt Nam — 2/9
  {
    id: 'national-day',
    name: 'Quốc khánh Việt Nam',
    priority: 15,
    type: 'le-lon',
    dateRule: { kind: 'fixed', month: 9, day: 2 },
    theme: {
      background: 'linear-gradient(160deg, #3a0a0a 0%, #8a1414 55%, #b8860b 100%)',
      accent: '#fbd063',
      textColor: '#fffbeb',
      subtitleColor: 'rgba(255, 251, 235, 0.8)',
      composition: { archetype: 'star-emblem', variant: 'star', ribbonAngle: -12 },
      decoration: {
        particleEmoji: ['⭐', '🎆'],
        particleAnimation: 'burst',
        particleCount: 12,
      },
    },
    content: {
      title: 'Quốc khánh Việt Nam 2/9',
      subtitle: 'Độc lập – Tự do – Hạnh phúc',
      titleEn: 'Vietnam National Day (Sep 2)',
      subtitleEn: 'Independence – Freedom – Happiness',
    },
  },

  // Giải phóng miền Nam — 30/4
  {
    id: 'reunification-day',
    name: 'Giải phóng miền Nam',
    priority: 30,
    type: 'le-lon',
    dateRule: { kind: 'fixed', month: 4, day: 30 },
    theme: {
      background: 'linear-gradient(160deg, #34090c 0%, #7a1414 60%, #9a1f1f 100%)',
      accent: '#e8b34a',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.78)',
      composition: { archetype: 'star-emblem', variant: 'medal', ribbonAngle: 18 },
      decoration: {
        particleEmoji: ['⭐'],
        particleAnimation: 'twinkle',
        particleCount: 6,
      },
    },
    content: {
      title: 'Ngày Giải phóng miền Nam',
      subtitle: 'Thống nhất đất nước – 30/4',
      titleEn: 'Reunification Day',
      subtitleEn: 'National reunification – April 30',
    },
  },

  // Quốc tế Lao động — 1/5
  {
    id: 'labor-day',
    name: 'Quốc tế Lao động',
    priority: 65,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 5, day: 1 },
    theme: {
      background: 'linear-gradient(160deg, #7c2d12 0%, #b45309 55%, #d97706 100%)',
      accent: '#fed7aa',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.8)',
      composition: { archetype: 'geometric-abstract', variant: 'tool' },
      decoration: {
        particleEmoji: ['✨'],
        particleAnimation: 'twinkle',
        particleCount: 6,
      },
    },
    content: {
      title: 'Quốc tế Lao động 1/5',
      subtitle: 'Trân trọng những nỗ lực và cống hiến',
      titleEn: 'International Labor Day (May 1)',
      subtitleEn: 'Honoring hard work and dedication',
    },
  },

  // Ngày Quốc tế Phụ nữ — 8/3
  {
    id: 'womens-day',
    name: 'Ngày Quốc tế Phụ nữ',
    priority: 60,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 3, day: 8 },
    theme: {
      background: 'linear-gradient(160deg, #4a0d24 0%, #9d174d 55%, #db2777 100%)',
      accent: '#fbcfe8',
      textColor: '#fdf2f8',
      subtitleColor: 'rgba(253, 242, 248, 0.82)',
      composition: { archetype: 'floral-arrangement', variant: 'bloom' },
      decoration: {
        particleEmoji: ['🌷', '🌸', '💐'],
        particleAnimation: 'float',
        particleCount: 12,
      },
    },
    content: {
      title: 'Ngày Quốc tế Phụ nữ 8/3',
      subtitle: 'Chúc luôn xinh đẹp, hạnh phúc và tràn đầy yêu thương',
      titleEn: "International Women's Day (Mar 8)",
      subtitleEn: 'Wishing you beauty, happiness, and love',
    },
  },

  // Ngày Phụ nữ Việt Nam — 20/10
  {
    id: 'vietnamese-womens-day',
    name: 'Ngày Phụ nữ Việt Nam',
    priority: 60,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 10, day: 20 },
    theme: {
      background: 'linear-gradient(160deg, #3f0f2e 0%, #6b214f 55%, #9d3b6b 100%)',
      accent: '#e8b4d8',
      textColor: '#fdf4fa',
      subtitleColor: 'rgba(253, 244, 250, 0.8)',
      composition: { archetype: 'floral-arrangement', variant: 'orchid', rotation: 8 },
      decoration: {
        particleEmoji: ['🌺', '💮'],
        particleAnimation: 'float',
        particleCount: 10,
      },
    },
    content: {
      title: 'Ngày Phụ nữ Việt Nam 20/10',
      subtitle: 'Trân trọng vẻ đẹp và bản lĩnh người phụ nữ Việt',
      titleEn: "Vietnamese Women's Day (Oct 20)",
      subtitleEn: 'Celebrating the grace and strength of Vietnamese women',
    },
  },

  // Christmas
  {
    id: 'christmas',
    name: 'Christmas',
    priority: 10,
    dateRule: { kind: 'fixed', month: 12, day: 25 },
    theme: {
      background: 'linear-gradient(160deg, #052e1c 0%, #14532d 55%, #7f1d1d 100%)',
      accent: '#eac96a',
      textColor: '#f8fafc',
      subtitleColor: 'rgba(248, 250, 252, 0.78)',
      composition: { archetype: 'tree-scene' },
      decoration: {
        particleEmoji: ['❄️', '🎄', '✨'],
        particleAnimation: 'fall',
        particleCount: 16,
      },
    },
    content: {
      title: 'Merry Christmas',
      subtitle: 'Giáng sinh an lành bên người thân yêu',
      titleEn: 'Merry Christmas',
      subtitleEn: 'A peaceful Christmas with the ones you love',
    },
  },

  // Halloween — 31/10
  {
    id: 'halloween',
    name: 'Halloween',
    priority: 70,
    dateRule: { kind: 'fixed', month: 10, day: 31 },
    theme: {
      background: 'linear-gradient(160deg, #0a0713 0%, #2e1065 55%, #c2410c 100%)',
      accent: '#fb923c',
      textColor: '#fde68a',
      subtitleColor: 'rgba(253, 230, 138, 0.75)',
      composition: { archetype: 'moon-scene' },
      decoration: {
        particleEmoji: ['🎃', '👻', '🕸️'],
        particleAnimation: 'float',
        particleCount: 10,
      },
    },
    content: {
      title: 'Happy Halloween',
    },
  },

  // Valentine's Day — 14/2
  {
    id: 'valentine',
    name: "Valentine's Day",
    priority: 70,
    dateRule: { kind: 'fixed', month: 2, day: 14 },
    theme: {
      background: 'linear-gradient(160deg, #3f0512 0%, #9f1239 55%, #fb7185 100%)',
      accent: '#fecdd3',
      textColor: '#fff1f2',
      subtitleColor: 'rgba(255, 241, 242, 0.8)',
      composition: { archetype: 'heart-bloom' },
      decoration: {
        particleEmoji: ['❤️', '💕', '💖'],
        particleAnimation: 'float',
        particleCount: 12,
      },
    },
    content: {
      title: "Happy Valentine's Day",
    },
  },

  // Ngày Quốc tế Thiếu nhi — 1/6
  {
    id: 'childrens-day',
    name: 'Ngày Quốc tế Thiếu nhi',
    priority: 65,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 6, day: 1 },
    theme: {
      background: 'linear-gradient(160deg, #0c4a6e 0%, #0369a1 55%, #eab308 100%)',
      accent: '#fde68a',
      textColor: '#f0f9ff',
      subtitleColor: 'rgba(240, 249, 255, 0.82)',
      composition: { archetype: 'geometric-abstract', variant: 'blocks' },
      decoration: {
        particleEmoji: ['🎈', '🎉', '⭐'],
        particleAnimation: 'float',
        particleCount: 10,
      },
    },
    content: {
      title: 'Ngày Quốc tế Thiếu nhi 1/6',
      subtitle: 'Chúc các bạn nhỏ luôn vui khỏe và hạnh phúc',
      titleEn: "International Children's Day (Jun 1)",
      subtitleEn: 'Wishing every child health and happiness',
    },
  },

  // Tết Dương Lịch — 1/1
  {
    id: 'new-year',
    name: 'Tết Dương Lịch',
    priority: 40,
    dateRule: { kind: 'fixed', month: 1, day: 1 },
    theme: {
      background: 'linear-gradient(160deg, #1e1b4b 0%, #4c1d95 55%, #a16207 100%)',
      accent: '#f5d78e',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      composition: { archetype: 'midnight-sparkle', variant: 'new-year' },
      decoration: {
        particleEmoji: ['🎆', '✨', '🎉'],
        particleAnimation: 'burst',
        particleCount: 16,
      },
    },
    content: {
      title: 'Chúc mừng năm mới {year}!',
      subtitle: 'Một năm mới an khang, hạnh phúc và nhiều thành công',
      titleEn: 'Happy New Year {year}!',
      subtitleEn: 'Wishing you a healthy, happy, and successful year ahead',
    },
  },

  // New Year's Eve — 31/12
  {
    id: 'new-year-eve',
    name: "New Year's Eve",
    priority: 20,
    dateRule: { kind: 'fixed', month: 12, day: 31 },
    theme: {
      background: 'linear-gradient(160deg, #0f172a 0%, #312e81 55%, #86198f 100%)',
      accent: '#f0abfc',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      composition: { archetype: 'midnight-sparkle', variant: 'countdown', rotation: 10 },
      decoration: {
        particleEmoji: ['🎆', '🥂', '✨'],
        particleAnimation: 'burst',
        particleCount: 16,
      },
    },
    content: {
      title: 'Goodbye {year} - Welcome {nextYear}',
      subtitle: 'Cùng đếm ngược chào đón năm mới',
      subtitleEn: "Let's count down to the new year together",
    },
  },

  // Ngày Nhà giáo Việt Nam — 20/11
  {
    id: 'teachers-day',
    name: 'Ngày Nhà giáo Việt Nam',
    priority: 60,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 11, day: 20 },
    theme: {
      background: 'linear-gradient(160deg, #451a03 0%, #92400e 55%, #b45309 100%)',
      accent: '#fde9c4',
      textColor: '#fffbeb',
      subtitleColor: 'rgba(255, 251, 235, 0.8)',
      composition: { archetype: 'geometric-abstract', variant: 'books' },
      decoration: {
        particleEmoji: ['📚', '✏️', '🌻'],
        particleAnimation: 'float',
        particleCount: 8,
      },
    },
    content: {
      title: 'Ngày Nhà giáo Việt Nam 20/11',
      subtitle: 'Tri ân thầy cô – những người lái đò thầm lặng',
      titleEn: "Vietnamese Teachers' Day (Nov 20)",
      subtitleEn: 'Honoring teachers, our quiet guides',
    },
  },

  // Ngày thành lập Quân đội Nhân dân Việt Nam — 22/12
  {
    id: 'army-day',
    name: 'Ngày thành lập Quân đội Nhân dân Việt Nam',
    priority: 55,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 12, day: 22 },
    theme: {
      background: 'linear-gradient(160deg, #052e16 0%, #14532d 55%, #7f1d1d 100%)',
      accent: '#facc15',
      textColor: '#f0fdf4',
      subtitleColor: 'rgba(240, 253, 244, 0.8)',
      composition: { archetype: 'star-emblem', variant: 'star', ribbonAngle: 0 },
      decoration: {
        particleEmoji: ['⭐'],
        particleAnimation: 'twinkle',
        particleCount: 6,
      },
    },
    content: {
      title: 'Ngày thành lập Quân đội Nhân dân Việt Nam',
      subtitle: '22/12 – Tự hào truyền thống anh hùng',
      titleEn: "Vietnam People's Army Foundation Day",
      subtitleEn: 'Dec 22 – Proud of a heroic tradition',
    },
  },
];
