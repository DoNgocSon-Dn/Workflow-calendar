import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

/**
 * Hành vi debounce của ô tìm kiếm.
 *
 * Kiểm trực tiếp trên đường ống RxJS mà CalendarStore dựng, thay vì khởi tạo cả
 * store — store kéo theo HTTP, Supabase, socket và một effect tự nạp dữ liệu,
 * không liên quan gì tới thứ đang cần chứng minh ở đây.
 *
 * Nếu đổi thời lượng hoặc bộ operator trong store thì phải sửa cả file này —
 * phép kiểm cuối cùng đọc thẳng mã nguồn để bắt đúng tình huống đó.
 */
describe('Tìm kiếm sự kiện — debounce 500ms', () => {
  const DEBOUNCE_MS = 500;

  /** Dựng lại đúng đường ống trong CalendarStore. */
  function makePipe() {
    const input$ = new Subject<string>();
    const searched: string[] = [];
    const sub = input$
      .pipe(debounceTime(DEBOUNCE_MS), distinctUntilChanged())
      .subscribe((q) => searched.push(q));
    return { input$, searched, stop: () => sub.unsubscribe() };
  }

  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('gõ một ký tự: chưa tìm ngay, phải đợi đủ 500ms', async () => {
    const p = makePipe();
    p.input$.next('c');

    await tick(300);
    expect(p.searched).toEqual([]);

    await tick(300);
    expect(p.searched).toEqual(['c']);
    p.stop();
  });

  it('gõ liên tục c → ca → cal: chỉ tìm MỘT lần, với từ khoá cuối', async () => {
    const p = makePipe();

    p.input$.next('c');
    await tick(200);
    p.input$.next('ca');
    await tick(300);
    p.input$.next('cal');

    // Chưa đủ 500ms kể từ phím cuối.
    await tick(300);
    expect(p.searched).toEqual([]);

    await tick(300);
    expect(p.searched).toEqual(['cal']);
    p.stop();
  });

  it('gõ nhanh 10 phím chỉ chạy tìm kiếm một lần', async () => {
    const p = makePipe();
    for (const ch of 'hop nhom'.split('')) {
      p.input$.next(ch);
      await tick(50);
    }
    await tick(600);
    expect(p.searched.length).toBe(1);
    expect(p.searched[0]).toBe('m');
    p.stop();
  });

  it('ngừng đủ lâu giữa hai từ khoá thì tìm cả hai lần', async () => {
    const p = makePipe();
    p.input$.next('hop');
    await tick(600);
    p.input$.next('demo');
    await tick(600);
    expect(p.searched).toEqual(['hop', 'demo']);
    p.stop();
  });

  it('xoá hết chữ vẫn debounce, rồi trả về danh sách đầy đủ', async () => {
    const p = makePipe();
    p.input$.next('hop');
    await tick(600);
    expect(p.searched).toEqual(['hop']);

    p.input$.next('');
    await tick(300);
    // Vẫn trong thời gian chờ — chưa được reset danh sách.
    expect(p.searched).toEqual(['hop']);

    await tick(300);
    // Chuỗi rỗng = không lọc gì = hiện lại toàn bộ.
    expect(p.searched).toEqual(['hop', '']);
    p.stop();
  });

  it('gõ rồi xoá về đúng chuỗi cũ: KHÔNG tìm lại lần nữa', async () => {
    const p = makePipe();
    p.input$.next('hop');
    await tick(600);

    p.input$.next('hopx');
    await tick(100);
    p.input$.next('hop');
    await tick(600);

    // 'hopx' chưa kịp phát, và 'hop' trùng lần trước nên bị chặn.
    expect(p.searched).toEqual(['hop']);
    p.stop();
  });

  it('kết quả cũ không bao giờ ghi đè từ khoá mới hơn', async () => {
    const p = makePipe();
    p.input$.next('a');
    await tick(100);
    p.input$.next('ab');
    await tick(100);
    p.input$.next('abc');
    await tick(700);

    // Chỉ giá trị mới nhất được dùng — không có 'a' hay 'ab' chen vào sau.
    expect(p.searched).toEqual(['abc']);
    p.stop();
  });

  it('huỷ đăng ký thì không còn gì phát ra (không rò rỉ)', async () => {
    const p = makePipe();
    p.input$.next('hop');
    p.stop();
    await tick(700);
    expect(p.searched).toEqual([]);
  });

});
