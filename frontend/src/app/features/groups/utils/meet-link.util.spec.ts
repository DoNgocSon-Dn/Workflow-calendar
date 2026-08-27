import { describe, expect, it } from 'vitest';
import { normalizeMeetLink } from './meet-link.util';

describe('normalizeMeetLink', () => {
  it('giữ nguyên link đầy đủ đúng chuẩn', () => {
    expect(normalizeMeetLink('https://meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('thêm scheme cho link dán thiếu https', () => {
    expect(normalizeMeetLink('meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('dựng lại link từ mã phòng trần', () => {
    expect(normalizeMeetLink('abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('bỏ query và dấu / thừa mà Meet hay đính kèm khi copy', () => {
    expect(normalizeMeetLink('https://meet.google.com/abc-defg-hij?authuser=0')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    expect(normalizeMeetLink('https://meet.google.com/abc-defg-hij/')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('hạ chữ thường mã phòng gõ hoa', () => {
    expect(normalizeMeetLink('ABC-DEFG-HIJ')).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('bỏ khoảng trắng thừa hai đầu', () => {
    expect(normalizeMeetLink('  https://meet.google.com/abc-defg-hij  ')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('chấp nhận link lookup và giữ nguyên hoa thường của tên', () => {
    expect(normalizeMeetLink('https://meet.google.com/lookup/HopNhom_Q3')).toBe(
      'https://meet.google.com/lookup/HopNhom_Q3',
    );
  });

  it('từ chối link hội nghị của dịch vụ khác', () => {
    expect(normalizeMeetLink('https://meet.jit.si/Meet-x9k2h')).toBeNull();
    expect(normalizeMeetLink('https://zoom.us/j/1234567890')).toBeNull();
  });

  it('từ chối tên miền giả mạo chứa chuỗi meet.google.com', () => {
    expect(normalizeMeetLink('https://meet.google.com.evil.tld/abc-defg-hij')).toBeNull();
    expect(normalizeMeetLink('https://evil.tld/meet.google.com/abc-defg-hij')).toBeNull();
  });

  it('từ chối mã sai định dạng 3-4-3', () => {
    expect(normalizeMeetLink('abcd-efg-hij')).toBeNull();
    expect(normalizeMeetLink('abc-defg')).toBeNull();
    expect(normalizeMeetLink('123-4567-890')).toBeNull();
  });

  it('từ chối chuỗi rỗng và chuỗi rác', () => {
    expect(normalizeMeetLink('')).toBeNull();
    expect(normalizeMeetLink('   ')).toBeNull();
    expect(normalizeMeetLink('phòng họp nhóm')).toBeNull();
    expect(normalizeMeetLink('https://meet.google.com/')).toBeNull();
  });
});
