import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DialogService } from '../../../../core/services/dialog.service';
import { CalendarStore } from '../../data/calendar-store';
import { SUPABASE_CLIENT } from '../../../../core/supabase-client';
import { provideHttpClient } from '@angular/common/http';
import { ImportModalComponent } from './import-modal';

/**
 * Luồng hủy import: khi nào hỏi lại, khi nào đóng thẳng, và mọi đường thoát
 * (nút Hủy, nút quay lại, phím Escape) có đi qua cùng một chốt kiểm tra không.
 */
describe('ImportModalComponent — hủy import', () => {
  /**
   * Mỗi test giữ trạng thái RIÊNG trong closure, không dùng biến chung.
   *
   * Bản đầu tiên dùng biến ở phạm vi describe và bị lẫn kết quả: cú
   * setTimeout rời trang (180ms) của test trước nổ giữa test sau và ghi thêm
   * một lần điều hướng vào mảng đang được kiểm — làm test báo sai một lỗi
   * không hề tồn tại.
   */
  interface Harness {
    c: Internals;
    nav: string[][];
    calls: () => number;
    answerWith(v: boolean): void;
    showDialog(open: boolean): void;
  }

  function setup(): Harness {
    const nav: string[][] = [];
    let calls = 0;
    let answer = true;
    let dialogOpen = false;

    const dialog = {
      request: () => (dialogOpen ? { kind: 'confirm' } : null),
      confirm: async () => {
        calls += 1;
        return answer;
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: SUPABASE_CLIENT, useValue: { auth: { getSession: async () => ({ data: {} }) } } },
        { provide: Router, useValue: { navigate: (cmd: string[]) => { nav.push(cmd); return Promise.resolve(true); } } },
        { provide: DialogService, useValue: dialog },
        { provide: CalendarStore, useValue: { calendars: () => [] } },
      ],
    });

    const fixture = TestBed.createComponent(ImportModalComponent);
    return {
      c: fixture.componentInstance as never as Internals,
      nav,
      calls: () => calls,
      answerWith: (v: boolean) => { answer = v; },
      showDialog: (open: boolean) => { dialogOpen = open; },
    };
  }
  /** Chỉ những phần luồng hủy chạm tới — tránh ép kiểu `any` rải rác. */
  interface Internals {
    selectedFile: { set(v: File | null): void };
    eventsPreview: { set(v: unknown[]): void };
    importSuccess: { set(v: boolean): void };
    isImportDirty(): boolean;
    closing(): boolean;
    cancel(): Promise<void>;
    onEscape(e: Event): void;
  }

  const file = () => new File(['x'], 'lich.ics');
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Dài hơn EXIT_MS (180ms) để animation rời trang chạy xong. */
  const waitExit = () => wait(260);

  it('màn hình trống thì KHÔNG dirty', () => {
    const h = setup();
    const c = h.c;
    expect(c.isImportDirty()).toBe(false);
  });

  it('đã chọn file thì dirty', () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    expect(c.isImportDirty()).toBe(true);
  });

  it('đã đọc ra sự kiện thì dirty (kể cả khi không còn giữ file)', () => {
    const h = setup();
    const c = h.c;
    c.eventsPreview.set([{ title: 'A' }]);
    expect(c.isImportDirty()).toBe(true);
  });

  it('import xong thì HẾT dirty — dữ liệu đã vào lịch, không còn gì để mất', () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    c.eventsPreview.set([{ title: 'A' }]);
    c.importSuccess.set(true);
    expect(c.isImportDirty()).toBe(false);
  });

  it('chưa có dữ liệu: bấm Hủy đóng thẳng, KHÔNG hỏi', async () => {
    const h = setup();
    const c = h.c;
    await c.cancel();
    expect(h.calls()).toBe(0);
    await waitExit();
    expect(h.nav).toEqual([['/calendar']]);
  });

  it('có dữ liệu: bấm Hủy phải HỎI trước', async () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    await c.cancel();
    expect(h.calls()).toBe(1);
    await waitExit();
  });

  it('chọn "Tiếp tục Import": ở lại, KHÔNG mất file và không điều hướng', async () => {
    const h = setup();
    const c = h.c;
    const f = file();
    c.selectedFile.set(f);
    c.eventsPreview.set([{ title: 'A' }, { title: 'B' }]);
    h.answerWith(false);

    await c.cancel();
    await waitExit();

    expect(h.nav).toEqual([]);
    expect(c.closing()).toBe(false);
    // Dữ liệu còn nguyên: vẫn dirty nghĩa là file và danh sách chưa bị xoá.
    expect(c.isImportDirty()).toBe(true);
  });

  it('chọn "Hủy Import": chạy animation rồi mới điều hướng', async () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    h.answerWith(true);

    await c.cancel();
    // Ngay sau khi xác nhận, trang mới bắt đầu đóng — chưa rời đi.
    expect(c.closing()).toBe(true);
    expect(h.nav).toEqual([]);

    await waitExit();
    expect(h.nav).toEqual([['/calendar']]);
  });

  it('Escape đi qua đúng chốt kiểm tra như nút Hủy', async () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    c.onEscape(new KeyboardEvent('keydown'));
    await wait(0);
    expect(h.calls()).toBe(1);
  });

  it('Escape khi dialog đang mở thì KHÔNG đóng luôn cả trang', async () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    // Giả lập dialog xác nhận đang hiển thị.
    h.showDialog(true);

    c.onEscape(new KeyboardEvent('keydown'));
    await wait(0);

    expect(h.calls()).toBe(0);
    expect(c.closing()).toBe(false);
  });

  it('bấm Hủy nhiều lần chỉ điều hướng MỘT lần', async () => {
    const h = setup();
    const c = h.c;
    await Promise.all([c.cancel(), c.cancel(), c.cancel()]);
    await waitExit();
    expect(h.nav).toEqual([['/calendar']]);
  });

  it('có dữ liệu, bấm Hủy dồn dập chỉ hỏi MỘT lần', async () => {
    const h = setup();
    const c = h.c;
    c.selectedFile.set(file());
    await c.cancel();
    // Lần bấm thứ hai rơi vào lúc đang đóng — phải bị chặn.
    await c.cancel();
    expect(h.calls()).toBe(1);
    await waitExit();
    expect(h.nav).toEqual([['/calendar']]);
  });
});
