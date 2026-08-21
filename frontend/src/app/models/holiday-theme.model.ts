/**
 * Kiểu trang trí có sẵn cho popup ngày lễ. Mỗi component trang trí (fireworks,
 * snow, ...) được implement một lần trong HolidayPopup và tái sử dụng cho mọi
 * theme thông qua mảng `decorations` — thêm ngày lễ mới không cần thêm CSS mới,
 * trừ khi cần một loại trang trí hoàn toàn mới.
 */
export type HolidayDecoration =
  | 'fireworks'
  | 'confetti'
  | 'blossom'
  | 'lucky-envelope'
  | 'petals'
  | 'gold-star'
  | 'books'
  | 'hearts'
  | 'pumpkin-patch'
  | 'snow'
  | 'christmas-tree';

export interface HolidayDateRuleFixed {
  readonly kind: 'fixed';
  readonly month: number; // 1-12
  readonly day: number;
  /** Số ngày popup còn hiển thị tính từ ngày bắt đầu. Mặc định 1. */
  readonly durationDays?: number;
}

/**
 * Dùng cho ngày lễ âm lịch (Tết Nguyên Đán): ngày dương lịch tương ứng khác
 * nhau mỗi năm nên phải cấu hình thủ công theo từng năm, không suy đoán.
 */
export interface HolidayDateRuleYearlyMap {
  readonly kind: 'yearly-map';
  readonly datesByYear: Readonly<Record<number, readonly [month: number, day: number]>>;
  readonly durationDays?: number;
}

export type HolidayDateRule = HolidayDateRuleFixed | HolidayDateRuleYearlyMap;

export interface HolidayContent {
  readonly title: string;
  readonly subtitle?: string;
}

export interface HolidayTheme {
  readonly id: string;
  /** Số nhỏ hơn = ưu tiên cao hơn khi nhiều ngày lễ trùng ngày. */
  readonly priority: number;
  readonly dateRule: HolidayDateRule;
  readonly icon: string;
  readonly decorations: readonly HolidayDecoration[];
  readonly colors: {
    readonly background: string;
    readonly accent: string;
    readonly accentSoft: string;
    readonly text: string;
  };
  readonly getContent: (context: { readonly date: Date }) => HolidayContent;
}

export interface ResolvedHoliday {
  readonly theme: HolidayTheme;
  readonly content: HolidayContent;
}
