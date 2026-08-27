import { eventsImportedDraft, EventsImportedDraftInput, NotificationT } from './notification-drafts';
import { NotificationDraft } from './notification.model';

/** Dịch giả lập — trả về chuỗi tiếng Việt để test đọc được nội dung. */
const t: NotificationT = (key, vars) => {
  const templates: Record<string, string> = {
    'nd.eventsImported.title': 'Import lịch hoàn tất',
    'nd.eventsImported.body': 'Đã nhập {count} sự kiện vào lịch.',
    'nd.eventsImported.bodyToCalendar': 'Đã nhập {count} sự kiện vào lịch "{name}".',
  };
  let text = templates[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{${k}}`, String(v));
  return text;
};

const draft = (input: EventsImportedDraftInput) => eventsImportedDraft(t, input);

/**
 * Thông báo chuông cho một lần import file.
 *
 * Chuyện dễ sai nhất ở đây là ĐẾM: một lần import có tới hai đường về cùng một
 * sự thật — phản hồi HTTP của chính người bấm import, và gói socket
 * `events:bulk-created` phát cho cả phòng lịch. Hai đường đó tới theo thứ tự
 * nào cũng được (server phát socket ngay khi insert xong, hoàn toàn có thể về
 * TRƯỚC phản hồi HTTP), nhưng người dùng chỉ được thấy MỘT dòng.
 *
 * Cơ chế: `batchId` do client sinh, đi kèm request và được server trả lại
 * nguyên vẹn, nên nó là khoá chung cho cả hai đường.
 */
describe('Thông báo import — "Đã nhập N sự kiện vào lịch"', () => {
  /** Bản rút gọn của NotificationService: chỉ giữ đúng luật chống trùng theo id. */
  function makeCenter() {
    const list: NotificationDraft[] = [];
    return {
      list,
      ingest(draft: NotificationDraft): boolean {
        if (list.some((n) => n.id === draft.id)) return false;
        list.push(draft);
        return true;
      },
    };
  }

  it('nội dung đúng câu người dùng cần đọc', () => {
    const d = eventsImportedDraft(t, { batchId: 'b1', count: 20, calendarName: 'Cá nhân' });
    expect(d.message).toBe('Đã nhập 20 sự kiện vào lịch "Cá nhân".');
    expect(d.title).toBe('Import lịch hoàn tất');
  });

  it('không biết tên lịch thì vẫn thành câu, không lòi ra dấu ngoặc rỗng', () => {
    expect(eventsImportedDraft(t, { batchId: 'b1', count: 3 }).message).toBe(
      'Đã nhập 3 sự kiện vào lịch.',
    );
    expect(eventsImportedDraft(t, { batchId: 'b1', count: 3, calendarName: null }).message).toBe(
      'Đã nhập 3 sự kiện vào lịch.',
    );
  });

  it('socket về TRƯỚC phản hồi HTTP: vẫn chỉ một thông báo', () => {
    const c = makeCenter();
    const draft = () => eventsImportedDraft(t, { batchId: 'batch-1', count: 20, calendarName: 'Cá nhân' });

    expect(c.ingest(draft())).toBe(true);   // gói socket tới trước
    expect(c.ingest(draft())).toBe(false);  // phản hồi HTTP tới sau
    expect(c.list.length).toBe(1);
  });

  it('phản hồi HTTP về TRƯỚC socket: vẫn chỉ một thông báo', () => {
    const c = makeCenter();
    const draft = () => eventsImportedDraft(t, { batchId: 'batch-1', count: 20, calendarName: 'Cá nhân' });

    expect(c.ingest(draft())).toBe(true);
    expect(c.ingest(draft())).toBe(false);
    expect(c.list.length).toBe(1);
  });

  it('hai lần import khác nhau là hai thông báo khác nhau', () => {
    const c = makeCenter();
    c.ingest(eventsImportedDraft(t, { batchId: 'batch-1', count: 20 }));
    c.ingest(eventsImportedDraft(t, { batchId: 'batch-2', count: 5 }));
    expect(c.list.length).toBe(2);
  });

  it('cùng số lượng nhưng khác lần import thì KHÔNG bị gộp nhầm', () => {
    const c = makeCenter();
    c.ingest(eventsImportedDraft(t, { batchId: 'batch-1', count: 20, calendarName: 'Cá nhân' }));
    c.ingest(eventsImportedDraft(t, { batchId: 'batch-2', count: 20, calendarName: 'Cá nhân' }));
    // Nội dung giống hệt nhau — chỉ batchId phân biệt được. Nếu id dựng từ nội
    // dung thay vì batchId thì lần import thứ hai sẽ biến mất trong im lặng.
    expect(c.list.length).toBe(2);
  });

  it('KHÔNG đặt relatedId — một lô không trỏ về sự kiện đơn lẻ nào', () => {
    // Panel coi `event_update` là loại bấm vào thì mở sự kiện. Có relatedId ở
    // đây nghĩa là bấm vào sẽ đi tìm một sự kiện không tồn tại.
    const d = eventsImportedDraft(t, { batchId: 'b1', count: 20 });
    expect(d.type).toBe('event_update');
    expect(d.relatedId).toBeUndefined();
  });

  it('giữ lại số lượng trong metadata để dùng về sau', () => {
    expect(eventsImportedDraft(t, { batchId: 'b1', count: 20 }).metadata).toEqual({ count: '20' });
  });
});
