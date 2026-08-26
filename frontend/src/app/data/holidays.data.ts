import { Holiday, resolveGenericHolidayTheme } from '../models/holiday-theme.model';

/**
 * All holidays — solar and lunar. To add a new one, append one object here —
 * no other file needs to change (see `utils/holiday-resolver.ts`, the single
 * shared query every surface uses). `priority` decides which holiday wins
 * when more than one matches the same day (lower number = higher priority);
 * `popupEnabled` decides whether it shows the auto full-screen popup (only a
 * handful of major holidays should); `theme` is optional — omit it to fall
 * back to `resolveGenericHolidayTheme(type)` (a plain solid accent + icon,
 * for the ~30 "minor" observances that don't need bespoke art).
 */
export const HOLIDAYS: readonly Holiday[] = [
  // ============================================================
  // 9 "hero" holidays — bespoke solid-color theme + popup for the
  // officially-major ones. Lunar-based ones use computed dateRule kinds
  // (`lunar`/`lunar-range`), never a hand-typed per-year date.
  // ============================================================

  // Tết Nguyên Đán — mùng 1 đến mùng 5 âm lịch. Computed every year via
  // findLunarDateInSolarYear(); Tất niên (29/30 tháng Chạp) is its own
  // separate entry right below Tết on the calendar, not part of this range.
  {
    id: 'tet-nguyen-dan',
    name: 'Tết Nguyên Đán',
    priority: 5,
    type: 'le-lon',
    officialHoliday: true,
    popupEnabled: true,
    dateRule: { kind: 'lunar-range', month: 1, day: 1, days: 5 },
    theme: {
      background: '#FAF7F2',
      accent: '#B91C1C',
      textColor: '#241A1A',
      subtitleColor: '#5b4444',
      // Cành mai/đào + lì xì đong đưa vẽ ngay trong scene (xem
      // 'tet-branch-scene' ở holiday-visual.html) — bỏ 🧧 khỏi particle nổi để
      // khỏi trùng với phong bao đã treo thật trên cành.
      composition: { archetype: 'tet-branch-scene' },
      decoration: { particleEmoji: ['🌸', '✨'], particleAnimation: 'float', particleCount: 14 },
      backgroundImage: '/assets/holidays/tet-nguyen-dan.jpg',
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
    officialHoliday: true,
    popupEnabled: true,
    dateRule: { kind: 'fixed', month: 9, day: 2 },
    theme: {
      background: '#7f1d1d',
      accent: '#fbd063',
      textColor: '#fffbeb',
      subtitleColor: 'rgba(255, 251, 235, 0.8)',
      composition: { archetype: 'star-emblem', variant: 'star', ribbonAngle: -12 },
      decoration: { particleEmoji: ['⭐', '🎆'], particleAnimation: 'burst', particleCount: 12 },
      backgroundImage: '/assets/holidays/national-day.jpg',
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
    officialHoliday: true,
    popupEnabled: true,
    dateRule: { kind: 'fixed', month: 4, day: 30 },
    theme: {
      background: '#831843',
      accent: '#e8b34a',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.78)',
      // Cờ Tổ quốc phấp phới + sao vàng + dải ruy băng + skyline mờ — trang
      // trọng/hiện đại, không hình ảnh chiến tranh/vũ khí.
      composition: { archetype: 'vietnam-flag-scene' },
      decoration: { particleAnimation: 'float' },
      backgroundImage: '/assets/holidays/reunification-day.jpg',
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
    officialHoliday: true,
    popupEnabled: true,
    dateRule: { kind: 'fixed', month: 5, day: 1 },
    theme: {
      background: '#92400e',
      accent: '#fed7aa',
      textColor: '#fff7ed',
      subtitleColor: 'rgba(255, 247, 237, 0.8)',
      composition: { archetype: 'geometric-abstract', variant: 'tool' },
      decoration: { particleEmoji: ['✨'], particleAnimation: 'twinkle', particleCount: 6 },
      backgroundImage: '/assets/holidays/labor-day.jpg',
    },
    content: {
      title: 'Quốc tế Lao động 1/5',
      subtitle: 'Trân trọng những nỗ lực và cống hiến',
      titleEn: 'International Labor Day (May 1)',
      subtitleEn: 'Honoring hard work and dedication',
    },
  },

  // Ngày Nhà giáo Việt Nam — 20/11
  {
    id: 'teachers-day',
    name: 'Ngày Nhà giáo Việt Nam',
    priority: 60,
    type: 'ky-niem',
    popupEnabled: true,
    dateRule: { kind: 'fixed', month: 11, day: 20 },
    theme: {
      background: '#78350f',
      accent: '#fde9c4',
      textColor: '#fffbeb',
      subtitleColor: 'rgba(255, 251, 235, 0.8)',
      composition: { archetype: 'geometric-abstract', variant: 'books' },
      decoration: { particleEmoji: ['📚', '✏️', '🌻'], particleAnimation: 'float', particleCount: 8 },
    },
    content: {
      title: 'Ngày Nhà giáo Việt Nam 20/11',
      subtitle: 'Tri ân thầy cô – những người lái đò thầm lặng',
      titleEn: "Vietnamese Teachers' Day (Nov 20)",
      subtitleEn: 'Honoring teachers, our quiet guides',
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
      background: '#9d174d',
      accent: '#fbcfe8',
      textColor: '#fdf2f8',
      subtitleColor: 'rgba(253, 242, 248, 0.82)',
      composition: { archetype: 'floral-arrangement', variant: 'bloom' },
      decoration: { particleEmoji: ['🌷', '🌸', '💐'], particleAnimation: 'float', particleCount: 12 },
    },
    content: {
      title: 'Ngày Quốc tế Phụ nữ 8/3',
      subtitle: 'Chúc luôn xinh đẹp, hạnh phúc và tràn đầy yêu thương',
      titleEn: "International Women's Day (Mar 8)",
      subtitleEn: 'Wishing you beauty, happiness, and love',
    },
  },

  // Ngày Phụ nữ Việt Nam — 20/10 (shares the Women's Day palette)
  {
    id: 'vietnamese-womens-day',
    name: 'Ngày Phụ nữ Việt Nam',
    priority: 60,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 10, day: 20 },
    theme: {
      background: '#831843',
      accent: '#e8b4d8',
      textColor: '#fdf4fa',
      subtitleColor: 'rgba(253, 244, 250, 0.8)',
      composition: { archetype: 'floral-arrangement', variant: 'orchid', rotation: 8 },
      decoration: { particleEmoji: ['🌺', '💮'], particleAnimation: 'float', particleCount: 10 },
    },
    content: {
      title: 'Ngày Phụ nữ Việt Nam 20/10',
      subtitle: 'Trân trọng vẻ đẹp và bản lĩnh người phụ nữ Việt',
      titleEn: "Vietnamese Women's Day (Oct 20)",
      subtitleEn: 'Celebrating the grace and strength of Vietnamese women',
    },
  },

  // Valentine's Day — 14/2
  {
    id: 'valentine',
    name: "Valentine's Day",
    priority: 70,
    dateRule: { kind: 'fixed', month: 2, day: 14 },
    theme: {
      background: '#9f1239',
      accent: '#fecdd3',
      textColor: '#fff1f2',
      subtitleColor: 'rgba(255, 241, 242, 0.8)',
      composition: { archetype: 'heart-bloom' },
      decoration: { particleEmoji: ['❤️', '💕', '💖'], particleAnimation: 'float', particleCount: 12 },
    },
    content: { title: "Happy Valentine's Day" },
  },

  // Tết Trung Thu — Rằm tháng 8 âm lịch. New hero theme, solid colors.
  {
    id: 'mid-autumn',
    name: 'Tết Trung Thu',
    priority: 45,
    type: 'le-hoi',
    popupEnabled: true,
    dateRule: { kind: 'lunar', month: 8, day: 15 },
    theme: {
      background: '#0f1f3d',
      accent: '#f0b429',
      textColor: '#fdf6e3',
      subtitleColor: 'rgba(253, 246, 227, 0.8)',
      composition: { archetype: 'moon-scene', variant: 'mid-autumn' },
      decoration: { particleEmoji: ['🌕', '🏮', '⭐'], particleAnimation: 'float', particleCount: 10 },
    },
    content: {
      title: 'Tết Trung Thu',
      subtitle: 'Rằm tháng 8 – Tết Đoàn Viên',
      titleEn: 'Mid-Autumn Festival',
      subtitleEn: 'A night of lanterns and family reunion',
    },
  },

  // Christmas — 24-25/12
  {
    id: 'christmas',
    name: 'Christmas',
    priority: 10,
    popupEnabled: true,
    dateRule: { kind: 'fixed-range', month: 12, day: 24, days: 2 },
    theme: {
      background: '#14532d',
      accent: '#eac96a',
      textColor: '#f8fafc',
      subtitleColor: 'rgba(248, 250, 252, 0.78)',
      composition: { archetype: 'tree-scene' },
      decoration: { particleEmoji: ['❄️', '🎄', '✨'], particleAnimation: 'fall', particleCount: 16 },
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
      background: '#2e1065',
      accent: '#fb923c',
      textColor: '#fde68a',
      subtitleColor: 'rgba(253, 230, 138, 0.75)',
      composition: { archetype: 'moon-scene' },
      decoration: { particleEmoji: ['🎃', '👻', '🕸️'], particleAnimation: 'float', particleCount: 10 },
    },
    content: { title: 'Happy Halloween' },
  },

  // ============================================================
  // Còn lại: giữ nguyên từ hệ thống cũ (không phải 1 trong 9 "hero")
  // ============================================================

  // Ngày Quốc tế Thiếu nhi — 1/6
  {
    id: 'childrens-day',
    name: 'Ngày Quốc tế Thiếu nhi',
    priority: 65,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 6, day: 1 },
    theme: {
      background: '#0369a1',
      accent: '#fde68a',
      textColor: '#f0f9ff',
      subtitleColor: 'rgba(240, 249, 255, 0.82)',
      composition: { archetype: 'geometric-abstract', variant: 'blocks' },
      decoration: { particleEmoji: ['🎈', '🎉', '⭐'], particleAnimation: 'float', particleCount: 10 },
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
    officialHoliday: true,
    popupEnabled: true,
    dateRule: { kind: 'fixed', month: 1, day: 1 },
    theme: {
      background: '#1e1b4b',
      accent: '#f5d78e',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      composition: { archetype: 'midnight-sparkle', variant: 'new-year' },
      decoration: { particleEmoji: ['🎆', '✨', '🎉'], particleAnimation: 'burst', particleCount: 16 },
      backgroundImage: '/assets/holidays/new-year.jpg',
    },
    content: {
      title: 'Chúc mừng năm mới {year}!',
      subtitle: 'Một năm mới an khang, hạnh phúc và nhiều thành công',
      titleEn: 'Happy New Year {year}!',
      subtitleEn: 'Wishing you a healthy, happy, and successful year ahead',
    },
  },

  // New Year's Eve (dương lịch) — 31/12
  {
    id: 'new-year-eve',
    name: "New Year's Eve",
    priority: 20,
    dateRule: { kind: 'fixed', month: 12, day: 31 },
    theme: {
      background: '#0f172a',
      accent: '#f0abfc',
      textColor: '#ffffff',
      subtitleColor: 'rgba(255, 255, 255, 0.75)',
      composition: { archetype: 'midnight-sparkle', variant: 'countdown', rotation: 10 },
      decoration: { particleEmoji: ['🎆', '🥂', '✨'], particleAnimation: 'burst', particleCount: 16 },
    },
    content: {
      title: 'Goodbye {year} - Welcome {nextYear}',
      subtitle: 'Cùng đếm ngược chào đón năm mới',
      subtitleEn: "Let's count down to the new year together",
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
      background: '#14532d',
      accent: '#facc15',
      textColor: '#f0fdf4',
      subtitleColor: 'rgba(240, 253, 244, 0.8)',
      composition: { archetype: 'star-emblem', variant: 'star', ribbonAngle: 0 },
      decoration: { particleEmoji: ['⭐'], particleAnimation: 'twinkle', particleCount: 6 },
    },
    content: {
      title: 'Ngày thành lập Quân đội Nhân dân Việt Nam',
      subtitle: '22/12 – Tự hào truyền thống anh hùng',
      titleEn: "Vietnam People's Army Foundation Day",
      subtitleEn: 'Dec 22 – Proud of a heroic tradition',
    },
  },

  // ============================================================
  // Ngày lễ/kỷ niệm dương lịch khác (spec §6) — theme chung theo `type`
  // ============================================================

  {
    id: 'student-day',
    name: 'Ngày Sinh viên - Học sinh Việt Nam',
    priority: 85,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 1, day: 9 },
    content: { title: 'Ngày Sinh viên - Học sinh Việt Nam', titleEn: "Vietnamese Students' Day" },
  },
  {
    id: 'party-founding-day',
    name: 'Ngày thành lập Đảng Cộng sản Việt Nam',
    priority: 45,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 2, day: 3 },
    content: {
      title: 'Ngày thành lập Đảng Cộng sản Việt Nam',
      titleEn: 'Founding of the Communist Party of Vietnam',
    },
  },
  {
    id: 'vietnamese-doctors-day',
    name: 'Ngày Thầy thuốc Việt Nam',
    priority: 85,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 2, day: 27 },
    content: { title: 'Ngày Thầy thuốc Việt Nam', titleEn: "Vietnamese Doctors' Day" },
  },
  {
    id: 'youth-union-day',
    name: 'Ngày thành lập Đoàn TNCS Hồ Chí Minh',
    priority: 82,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 3, day: 26 },
    content: { title: 'Ngày thành lập Đoàn TNCS Hồ Chí Minh', titleEn: 'Ho Chi Minh Youth Union Day' },
  },
  {
    id: 'april-fools',
    name: 'Cá tháng Tư',
    priority: 90,
    type: 'le-hoi',
    dateRule: { kind: 'fixed', month: 4, day: 1 },
    content: { title: 'Cá tháng Tư', titleEn: "April Fools' Day" },
  },
  {
    id: 'book-day',
    name: 'Ngày Sách và Văn hóa đọc Việt Nam',
    priority: 88,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 4, day: 21 },
    content: { title: 'Ngày Sách và Văn hóa đọc Việt Nam', titleEn: 'Vietnam Book and Reading Culture Day' },
  },
  {
    id: 'dien-bien-phu',
    name: 'Ngày Chiến thắng Điện Biên Phủ',
    priority: 50,
    type: 'le-lon',
    dateRule: { kind: 'fixed', month: 5, day: 7 },
    content: { title: 'Ngày Chiến thắng Điện Biên Phủ', titleEn: 'Dien Bien Phu Victory Day' },
  },
  {
    id: 'children-team-day',
    name: 'Ngày thành lập Đội TNTP Hồ Chí Minh',
    priority: 86,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 5, day: 15 },
    content: { title: 'Ngày thành lập Đội TNTP Hồ Chí Minh', titleEn: 'Ho Chi Minh Young Pioneers Day' },
  },
  {
    id: 'ho-chi-minh-birthday',
    name: 'Ngày sinh Chủ tịch Hồ Chí Minh',
    priority: 42,
    type: 'le-lon',
    dateRule: { kind: 'fixed', month: 5, day: 19 },
    content: { title: 'Ngày sinh Chủ tịch Hồ Chí Minh', titleEn: "President Ho Chi Minh's Birthday" },
  },
  {
    id: 'press-day',
    name: 'Ngày Báo chí Cách mạng Việt Nam',
    priority: 78,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 6, day: 21 },
    content: { title: 'Ngày Báo chí Cách mạng Việt Nam', titleEn: 'Vietnam Revolutionary Press Day' },
  },
  {
    id: 'vietnam-family-day',
    name: 'Ngày Gia đình Việt Nam',
    priority: 84,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 6, day: 28 },
    content: { title: 'Ngày Gia đình Việt Nam', titleEn: 'Vietnamese Family Day' },
  },
  {
    id: 'world-population-day',
    name: 'Ngày Dân số Thế giới',
    priority: 92,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 7, day: 11 },
    content: { title: 'Ngày Dân số Thế giới', titleEn: 'World Population Day' },
  },
  {
    id: 'war-invalids-martyrs-day',
    name: 'Ngày Thương binh, Liệt sĩ',
    priority: 58,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 7, day: 27 },
    content: { title: 'Ngày Thương binh, Liệt sĩ', titleEn: 'War Invalids and Martyrs Day' },
  },
  {
    id: 'trade-union-day',
    name: 'Ngày thành lập Công đoàn Việt Nam',
    priority: 83,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 7, day: 28 },
    content: { title: 'Ngày thành lập Công đoàn Việt Nam', titleEn: 'Vietnam Trade Union Day' },
  },
  {
    id: 'august-revolution',
    name: 'Ngày Cách mạng tháng Tám thành công',
    priority: 48,
    type: 'le-lon',
    dateRule: { kind: 'fixed', month: 8, day: 19 },
    content: { title: 'Ngày Cách mạng tháng Tám thành công', titleEn: 'August Revolution Day' },
  },
  {
    id: 'vietnam-fatherland-front',
    name: 'Ngày thành lập Mặt trận Tổ quốc Việt Nam',
    priority: 87,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 9, day: 10 },
    content: {
      title: 'Ngày thành lập Mặt trận Tổ quốc Việt Nam',
      titleEn: 'Vietnam Fatherland Front Foundation Day',
    },
  },
  {
    id: 'elderly-day',
    name: 'Ngày Quốc tế Người cao tuổi',
    priority: 89,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 10, day: 1 },
    content: { title: 'Ngày Quốc tế Người cao tuổi', titleEn: 'International Day of Older Persons' },
  },
  {
    id: 'hanoi-liberation-day',
    name: 'Ngày Giải phóng Thủ đô',
    priority: 52,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 10, day: 10 },
    content: { title: 'Ngày Giải phóng Thủ đô', titleEn: 'Liberation Day of Hanoi' },
  },
  {
    id: 'vietnam-entrepreneurs-day',
    name: 'Ngày Doanh nhân Việt Nam',
    priority: 81,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 10, day: 13 },
    content: { title: 'Ngày Doanh nhân Việt Nam', titleEn: "Vietnamese Entrepreneurs' Day" },
  },
  {
    id: 'vietnam-law-day',
    name: 'Ngày Pháp luật Việt Nam',
    priority: 91,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 11, day: 9 },
    content: { title: 'Ngày Pháp luật Việt Nam', titleEn: 'Vietnam Law Day' },
  },
  {
    id: 'red-cross-day',
    name: 'Ngày thành lập Hội Chữ thập đỏ Việt Nam',
    priority: 86,
    type: 'ky-niem',
    dateRule: { kind: 'fixed', month: 11, day: 23 },
    content: { title: 'Ngày thành lập Hội Chữ thập đỏ Việt Nam', titleEn: 'Vietnam Red Cross Foundation Day' },
  },
  {
    id: 'world-aids-day',
    name: 'Ngày Thế giới phòng chống AIDS',
    priority: 93,
    type: 'quoc-te',
    dateRule: { kind: 'fixed', month: 12, day: 1 },
    content: { title: 'Ngày Thế giới phòng chống AIDS', titleEn: 'World AIDS Day' },
  },

  // ============================================================
  // Ngày lễ âm lịch khác (spec §8) — computed, không hard-code
  // ============================================================

  {
    id: 'than-tai',
    name: 'Ngày Vía Thần Tài',
    priority: 79,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 1, day: 10 },
    content: { title: 'Ngày Vía Thần Tài', titleEn: 'God of Wealth Day' },
  },
  {
    id: 'nguyen-tieu',
    name: 'Tết Nguyên Tiêu',
    priority: 77,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 1, day: 15 },
    content: { title: 'Tết Nguyên Tiêu', subtitle: 'Rằm tháng Giêng', titleEn: 'Lantern Festival' },
  },
  {
    id: 'han-thuc',
    name: 'Tết Hàn Thực',
    priority: 88,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 3, day: 3 },
    content: { title: 'Tết Hàn Thực', titleEn: 'Cold Food Festival' },
  },
  {
    id: 'hung-kings',
    name: 'Giỗ Tổ Hùng Vương',
    priority: 35,
    type: 'le-lon',
    officialHoliday: true,
    popupEnabled: true,
    dateRule: { kind: 'lunar', month: 3, day: 10 },
    // Trống đồng Đông Sơn — trang nghiêm, không màu mè: nền nâu đất/đồng cổ,
    // KHÔNG particle hoa/emoji (spec: "không làm scene vui nhộn"). Bụi đồng
    // (bronze dust) được scene tự vẽ trong DongSonDrumMotif, không đi qua
    // particleEmoji chung.
    theme: {
      background: '#2b1c10',
      accent: '#c98a3a',
      textColor: '#fdf3e0',
      subtitleColor: 'rgba(253, 243, 224, 0.82)',
      composition: { archetype: 'dong-son-drum-scene' },
      decoration: { particleAnimation: 'float' },
      backgroundImage: '/assets/holidays/hung-kings.jpg',
    },
    content: {
      title: 'Giỗ Tổ Hùng Vương',
      subtitle: 'Mùng 10 tháng 3 Âm lịch — Đời đời nhớ ơn các Vua Hùng',
      titleEn: 'Hung Kings Commemoration Day',
      subtitleEn: 'The 10th day of the 3rd lunar month — In eternal gratitude to the Hung Kings',
    },
  },
  {
    id: 'vesak',
    name: 'Lễ Phật Đản',
    priority: 68,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 4, day: 15 },
    content: { title: 'Lễ Phật Đản', subtitle: 'Rằm tháng 4', titleEn: 'Vesak (Buddha Day)' },
  },
  {
    id: 'doan-ngo',
    name: 'Tết Đoan Ngọ',
    priority: 76,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 5, day: 5 },
    content: { title: 'Tết Đoan Ngọ', titleEn: 'Doan Ngo Festival' },
  },
  {
    id: 'vu-lan',
    name: 'Lễ Vu Lan',
    priority: 66,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 7, day: 15 },
    content: { title: 'Lễ Vu Lan', subtitle: 'Rằm tháng 7 – Báo hiếu cha mẹ', titleEn: 'Vu Lan (Ghost Festival)' },
  },
  {
    id: 'double-ninth',
    name: 'Tết Trùng Cửu',
    priority: 90,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 9, day: 9 },
    content: { title: 'Tết Trùng Cửu', titleEn: 'Double Ninth Festival' },
  },
  {
    id: 'double-tenth',
    name: 'Tết Trùng Thập',
    priority: 91,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 10, day: 10 },
    content: { title: 'Tết Trùng Thập', titleEn: 'Double Tenth Festival' },
  },
  {
    id: 'ha-nguyen',
    name: 'Lễ Hạ Nguyên',
    priority: 92,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 10, day: 15 },
    content: { title: 'Lễ Hạ Nguyên', titleEn: 'Ha Nguyen Festival' },
  },
  {
    id: 'tao-quan',
    name: 'Ông Công, Ông Táo',
    priority: 47,
    type: 'le-hoi',
    dateRule: { kind: 'lunar', month: 12, day: 23 },
    content: { title: 'Ông Công, Ông Táo', titleEn: 'Kitchen Gods Day' },
  },
  {
    id: 'tat-nien',
    name: 'Tất niên (Đêm Giao thừa)',
    priority: 44,
    type: 'le-lon',
    dateRule: { kind: 'lunar-month-end', month: 12 },
    content: {
      title: 'Tất niên – Chào đón Giao thừa',
      titleEn: "Lunar New Year's Eve",
    },
  },
];
