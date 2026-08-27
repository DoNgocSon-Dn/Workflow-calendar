import { beforeEach, describe, expect, it } from 'vitest';
import { DialogService } from './dialog.service';

/**
 * Hộp thoại nhiều lựa chọn (radio + OK/Hủy) — nền của popup "Xóa sự kiện định
 * kỳ". Khác hành vi cũ: bấm vào một lựa chọn KHÔNG đóng ngay, người dùng đổi ý
 * bao nhiêu lần cũng được rồi mới bấm OK, đúng kiểu Google Calendar.
 */
describe('DialogService.choice — popup xoá sự kiện định kỳ', () => {
  let dialog: DialogService;

  const options = [
    { value: 'this', label: 'Sự kiện này' },
    { value: 'following', label: 'Sự kiện này và các sự kiện tiếp theo' },
    { value: 'all', label: 'Tất cả sự kiện' },
  ];

  beforeEach(() => {
    dialog = new DialogService();
  });

  it('mặc định tick lựa chọn ĐẦU TIÊN ("Sự kiện này")', () => {
    void dialog.choice('', options, { title: 'Xóa sự kiện định kỳ' });
    expect(dialog.selectedChoice()).toBe('this');
    expect(dialog.request()?.kind).toBe('choice');
    expect(dialog.request()?.title).toBe('Xóa sự kiện định kỳ');
  });

  it('OK trả về đúng lựa chọn đang tick', async () => {
    const promise = dialog.choice('', options);
    dialog.selectedChoice.set('following');
    dialog.submitChoice();
    await expect(promise).resolves.toBe('following');
  });

  it('đổi ý vài lần rồi mới OK — chỉ giá trị cuối cùng được trả', async () => {
    const promise = dialog.choice('', options);
    dialog.selectedChoice.set('all');
    dialog.selectedChoice.set('following');
    dialog.selectedChoice.set('all');
    dialog.submitChoice();
    await expect(promise).resolves.toBe('all');
  });

  it('Hủy (nút / Esc / bấm ra ngoài) trả về null — nơi gọi sẽ không xoá gì', async () => {
    const promise = dialog.choice('', options);
    dialog.cancelChoice();
    await expect(promise).resolves.toBeNull();
  });
});
