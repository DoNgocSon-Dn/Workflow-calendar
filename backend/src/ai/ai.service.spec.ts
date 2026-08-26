import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService, AiParsedIntent } from './ai.service';

/**
 * geminiApiKey rỗng buộc `chat()` đi thẳng vào bộ phân tích cục bộ
 * (`parseLocalVietnameseEvent`) thay vì gọi mạng ra Gemini — cho phép kiểm
 * chứng logic nhận diện "246"/"357"/"CN" một cách xác định (deterministic),
 * không phụ thuộc phản hồi của một mô hình bên ngoài.
 */
async function createLocalOnlyService(): Promise<AiService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AiService,
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue({ geminiApiKey: '' }) } },
    ],
  }).compile();
  return module.get(AiService);
}

function byWeekdays(result: AiParsedIntent): number[] | undefined {
  return result.recurrence_rule?.byWeekdays;
}

function hourVn(iso: string | undefined): number {
  // Chuỗi trả về là UTC thật; +7 để đọc lại đúng giờ tường Việt Nam mà bài
  // test đã gõ vào câu hỏi.
  return (new Date(iso ?? '').getUTCHours() + 7) % 24;
}

/** "dd/mm/yyyy" theo giờ Việt Nam — dùng để so ngày (không phải giờ). */
function dateVn(iso: string | undefined): string {
  const d = new Date(new Date(iso ?? '').getTime() + 7 * 60 * 60 * 1000);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

describe('AiService — hiểu "246"/"357"/"CN" như các thứ trong tuần', () => {
  let service: AiService;

  beforeEach(async () => {
    service = await createLocalOnlyService();
  });

  describe('Lịch 246 = Thứ 2 + Thứ 4 + Thứ 6', () => {
    const variants = ['246', 'lịch 246', 'thứ 246', 'thứ 2 4 6', 'thứ 2, 4, 6', 'T2 T4 T6'];

    it.each(variants)('"%s từ 9h đến 11h" → byWeekdays [1,3,5], 09:00–11:00', async (phrase) => {
      const result = await service.chat(`Lên lịch học ${phrase} từ 9h đến 11h`, {
        events: [],
        history: [],
      });

      expect(result.intent).toBe('create_event');
      expect(byWeekdays(result)).toEqual([1, 3, 5]);
      expect(result.recurrence_rule?.freq).toBe('custom');
      expect(result.recurrence_rule?.unit).toBe('week');
      expect(hourVn(result.start_at)).toBe(9);
      expect(hourVn(result.end_at)).toBe(11);
    });
  });

  describe('Lịch 357 = Thứ 3 + Thứ 5 + Thứ 7', () => {
    const variants = ['357', 'lịch 357', 'thứ 357', 'thứ 3 5 7', 'thứ 3, 5, 7', 'T3 T5 T7'];

    it.each(variants)('"%s từ 13h đến 17h" → byWeekdays [2,4,6], 13:00–17:00', async (phrase) => {
      const result = await service.chat(`Lên lịch học ${phrase} từ 13h đến 17h`, {
        events: [],
        history: [],
      });

      expect(result.intent).toBe('create_event');
      expect(byWeekdays(result)).toEqual([2, 4, 6]);
      expect(hourVn(result.start_at)).toBe(13);
      expect(hourVn(result.end_at)).toBe(17);
    });
  });

  describe('CN / Chủ nhật — MỘT ngày, không tự ý thành lịch lặp', () => {
    const variants = ['CN', 'cn', 'Chủ nhật', 'chủ nhật'];

    it.each(variants)('"%s học lúc 8h" → Chủ nhật, không có recurrence_rule', async (phrase) => {
      const result = await service.chat(`${phrase} học lúc 8h`, { events: [], history: [] });

      expect(result.intent).toBe('create_event');
      expect(result.recurrence_rule).toBeFalsy();
      expect(hourVn(result.start_at)).toBe(8);
      // Chủ nhật = 0 theo Date.getUTCDay()/getDay().
      expect(new Date(result.start_at!).getUTCDay()).toBe(0);
    });
  });

  it('"Chủ nhật họp nhóm lúc 19h" → một cuộc họp Chủ nhật, không lặp lại', async () => {
    const result = await service.chat('Chủ nhật họp nhóm lúc 19h', { events: [], history: [] });

    expect(result.intent).toBe('create_event');
    expect(result.recurrence_rule).toBeFalsy();
    expect(hourVn(result.start_at)).toBe(19);
  });

  describe('Thiếu giờ thì hỏi lại, không tự bịa', () => {
    it('"T2 T4 T6 học lập trình" → unclear, thiếu time (đã hiểu đúng ngày)', async () => {
      const result = await service.chat('T2 T4 T6 học lập trình', { events: [], history: [] });

      expect(result.intent).toBe('unclear');
      expect(result.missingFields).toContain('time');
      expect(result.missingFields).not.toContain('date');
    });

    it('"T3 T5 T7 học tiếng Anh" → unclear, thiếu time', async () => {
      const result = await service.chat('T3 T5 T7 học tiếng Anh', { events: [], history: [] });

      expect(result.intent).toBe('unclear');
      expect(result.missingFields).toContain('time');
    });
  });

  describe('Ngữ cảnh: không áp dụng máy móc khi "246"/"357" là một con số thường', () => {
    it('"Mã 357" (mã định danh, không phải mã lịch) không tạo ra recurrence_rule', async () => {
      const result = await service.chat('Mã 357 cần xử lý, ngày mai họp lúc 9h', {
        events: [],
        history: [],
      });

      expect(result.intent).toBe('create_event');
      expect(result.recurrence_rule).toBeFalsy();
    });

    it('"246 nghìn đồng" (số tiền) không tạo ra recurrence_rule', async () => {
      const result = await service.chat('Tài khoản còn 246 nghìn đồng, ngày mai họp lúc 9h', {
        events: [],
        history: [],
      });

      expect(result.intent).toBe('create_event');
      expect(result.recurrence_rule).toBeFalsy();
    });

    it('câu không liên quan tới lịch thì không suy đoán bừa thành sự kiện', async () => {
      const result = await service.chat('Tôi có 246 nghìn đồng', { events: [], history: [] });

      // Không có ngày/giờ nào khác trong câu — phải hỏi lại, tuyệt đối không
      // tự tạo một sự kiện lặp lại vào Thứ 2/4/6 chỉ vì câu có chữ "246".
      expect(result.intent).toBe('unclear');
      expect((result as { recurrence_rule?: unknown }).recurrence_rule).toBeFalsy();
    });
  });

  describe('Không đụng tới cách hiểu MỘT thứ đơn đã có từ trước', () => {
    it('"Họp thứ 6 lúc 15h" vẫn là một cuộc họp Thứ 6 duy nhất, không lặp lại', async () => {
      const result = await service.chat('Họp thứ 6 lúc 15h', { events: [], history: [] });

      expect(result.intent).toBe('create_event');
      expect(result.recurrence_rule).toBeFalsy();
      expect(hourVn(result.start_at)).toBe(15);
      expect(new Date(result.start_at!).getUTCDay()).toBe(5); // Thứ 6
    });

    it('"Đi học ngày mai lúc 9h" vẫn hoạt động bình thường, không liên quan tới thứ trong tuần', async () => {
      const result = await service.chat('Đi học ngày mai lúc 9h', { events: [], history: [] });

      expect(result.intent).toBe('create_event');
      expect(result.recurrence_rule).toBeFalsy();
      expect(hourVn(result.start_at)).toBe(9);
    });
  });

  it('mã 3 chữ số có số ngoài phạm vi Thứ 2..Thứ 7 (vd "128") không được hiểu là lịch', async () => {
    const result = await service.chat('Lên lịch học 128 từ 9h đến 11h', { events: [], history: [] });

    // '1' và '8' không phải chỉ số thứ hợp lệ (2-7) nên KHÔNG được ghép
    // thành một nhóm thứ nào — vẫn có thể tạo sự kiện (đủ ngày "hôm nay"?
    // không, không có tín hiệu ngày nào khác) nhưng chắc chắn không lặp lại.
    expect(result.recurrence_rule).toBeFalsy();
  });

  describe('Lịch lặp GIỚI HẠN trong một khoảng ngày tường minh (nhóm thứ + startDate + endDate)', () => {
    it('Test 1: "357 từ 13/07/2026 tới 29/08/2026" KHÔNG có giờ → chỉ hỏi giờ, không hỏi lại ngày', async () => {
      const result = await service.chat(
        'Xếp lịch học 357 từ ngày 13/07/2026 tới 29/08/2026',
        { events: [], history: [] },
      );

      // Đây là điểm mấu chốt của cả tính năng: ngày/recurrence đã ĐỦ RÕ, chỉ
      // được thiếu "time" — tuyệt đối không rơi vào nhánh hỏi lại ngày.
      expect(result.intent).toBe('unclear');
      expect(result.missingFields).toEqual(['time']);
    });

    it('Test 2: "357 từ 13/07/2026 tới 29/08/2026 từ 9h đến 17h" → tạo lịch ngay, giới hạn đúng khoảng ngày', async () => {
      const result = await service.chat(
        'Xếp lịch học 357 từ ngày 13/07/2026 tới 29/08/2026 từ 9h đến 17h',
        { events: [], history: [] },
      );

      expect(result.intent).toBe('create_event');
      expect(byWeekdays(result)).toEqual([2, 4, 6]); // Thứ 3, Thứ 5, Thứ 7
      expect(hourVn(result.start_at)).toBe(9);
      expect(hourVn(result.end_at)).toBe(17);

      const rule = result.recurrence_rule!;
      expect(rule.endType).toBe('until');
      // Lần lặp cuối cùng vẫn phải rơi được vào chính ngày 29/08 nếu đó là
      // một Thứ 3/5/7 — nghĩa là "until" phải neo ở CUỐI ngày 29/08, không
      // phải đầu ngày (00:00) của nó.
      expect(dateVn(rule.until)).toBe('29/08/2026');
      expect(new Date(rule.until!).getUTCHours()).not.toBe(0);

      // Ngày bắt đầu thật (lần xuất hiện Thứ 3/5/7 gần nhất TỪ 13/07 trở đi)
      // phải nằm trong đúng tuần chứa 13/07/2026 — không được nhảy tới tận
      // "hôm nay" của trợ lý.
      const startDay = new Date(new Date(result.start_at!).getTime() + 7 * 60 * 60 * 1000).getUTCDay();
      expect([2, 4, 6]).toContain(startDay);
      expect(new Date(result.start_at!).getTime()).toBeLessThan(new Date('2026-07-20T00:00:00Z').getTime());
    });

    it('Test 3: "246 từ 01/09/2026 đến 30/11/2026, 7h đến 11h" → lặp Thứ 2/4/6, không hỏi lại', async () => {
      const result = await service.chat(
        'Lên lịch học 246 từ 01/09/2026 đến 30/11/2026, 7h đến 11h',
        { events: [], history: [] },
      );

      expect(result.intent).toBe('create_event');
      expect(byWeekdays(result)).toEqual([1, 3, 5]); // Thứ 2, Thứ 4, Thứ 6
      expect(hourVn(result.start_at)).toBe(7);
      expect(hourVn(result.end_at)).toBe(11);
      expect(dateVn(result.recurrence_rule!.until)).toBe('30/11/2026');
    });

    it('Test 4: "CN từ 01/09/2026 đến 30/09/2026 lúc 8h" → CN vẫn lặp được dù chỉ có MỘT thứ', async () => {
      // Thêm "Họp" làm tên hoạt động — câu gốc trong yêu cầu không nêu tên sự
      // kiện, và việc bắt buộc phải có tiêu đề là quy tắc CÓ SẴN từ trước
      // (không suy đoán hộ tiêu đề), không thuộc phạm vi tính năng thứ/khoảng
      // ngày này. Không có tên hoạt động thì AI đúng ra phải hỏi lại tên, chứ
      // không phải hỏi lại ngày/thứ — hành vi đó được kiểm ở test riêng ngay
      // bên dưới.
      const result = await service.chat('Họp CN từ 01/09/2026 đến 30/09/2026 lúc 8h', {
        events: [],
        history: [],
      });

      expect(result.intent).toBe('create_event');
      expect(byWeekdays(result)).toEqual([0]); // Chủ nhật
      expect(hourVn(result.start_at)).toBe(8);
      expect(dateVn(result.recurrence_rule!.until)).toBe('30/09/2026');

      const startDay = new Date(new Date(result.start_at!).getTime() + 7 * 60 * 60 * 1000).getUTCDay();
      expect(startDay).toBe(0);
    });

    it('không có tên hoạt động thì hỏi lại TIÊU ĐỀ, không phải ngày/thứ (ngày/thứ đã đủ rõ)', async () => {
      const result = await service.chat('CN từ 01/09/2026 đến 30/09/2026 lúc 8h', {
        events: [],
        history: [],
      });

      expect(result.intent).toBe('unclear');
      expect(result.missingFields).toEqual(['title']);
    });

    it('khoảng ngày hoàn toàn trong quá khứ vẫn được tôn trọng nguyên văn, không bị chặn bởi rào "quá khứ"', async () => {
      // Rào "không âm thầm tạo sự kiện quá khứ" (dùng cho "8h sáng nay" đã
      // trôi qua) KHÔNG được áp dụng cho một khoảng ngày người dùng chủ động
      // gõ ra — nếu không, test 1-3 ở trên sẽ hỏng bất cứ khi nào ngày chạy
      // test rơi vào giữa khoảng 13/07–29/08/2026.
      const result = await service.chat(
        'Xếp lịch học 357 từ ngày 01/01/2020 tới 31/01/2020 từ 9h đến 10h',
        { events: [], history: [] },
      );

      expect(result.intent).toBe('create_event');
      expect(dateVn(result.recurrence_rule!.until)).toBe('31/01/2020');
    });

    it('tiêu đề không còn sót lại chữ số/ngày tháng sau khi đã tách hết', async () => {
      const result = await service.chat(
        'Xếp lịch học 357 từ ngày 13/07/2026 tới 29/08/2026 từ 9h đến 17h',
        { events: [], history: [] },
      );

      expect(result.title).not.toMatch(/357|13\/07|29\/08|\d{4}/);
    });
  });
});
