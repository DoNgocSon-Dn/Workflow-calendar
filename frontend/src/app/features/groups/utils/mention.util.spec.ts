import { describe, expect, it } from 'vitest';
import {
  MENTION_ALL_LABEL,
  findActiveMention,
  insertMention,
  mentionsUser,
  normalizeForMentionSearch,
  normalizeMentions,
  splitMessageSegments,
} from './mention.util';
import { GroupMessageMention } from '../models/group.models';

describe('normalizeForMentionSearch', () => {
  it('bỏ dấu tiếng Việt và hạ chữ thường', () => {
    expect(normalizeForMentionSearch('Quốc Cường')).toBe('quoc cuong');
    expect(normalizeForMentionSearch('Sơn Đỗ')).toBe('son do');
  });

  it('xử lý đ/Đ như d/D (NFD không tách được chữ này)', () => {
    expect(normalizeForMentionSearch('Đặng')).toBe('dang');
  });
});

describe('findActiveMention', () => {
  it('bắt được @ ở đầu tin nhắn', () => {
    expect(findActiveMention('@', 1)).toEqual({ query: '', start: 0, end: 1 });
  });

  it('bắt được @ ở giữa tin nhắn', () => {
    expect(findActiveMention('Xin chào @Qu', 12)).toEqual({
      query: 'Qu',
      start: 9,
      end: 12,
    });
  });

  it('bỏ qua @ dính liền ký tự khác (email không phải mention)', () => {
    expect(findActiveMention('user@example.com', 16)).toBeNull();
  });

  it('trả về null khi dấu @ đã bị xoá', () => {
    expect(findActiveMention('Xin chào', 8)).toBeNull();
  });

  it('trả về null khi con trỏ rời khỏi vùng mention (quá nhiều từ)', () => {
    expect(findActiveMention('@An oi cho minh hoi cai nay', 27)).toBeNull();
  });

  it('vẫn nhận tên có khoảng trắng', () => {
    expect(findActiveMention('@Quoc Cu', 8)?.query).toBe('Quoc Cu');
  });
});

describe('insertMention', () => {
  it('chèn đúng vị trí con trỏ, giữ nguyên nội dung trước đó', () => {
    const text = 'Xin chào @';
    const active = findActiveMention(text, 10)!;
    expect(insertMention(text, active, 'Quốc Cường')).toEqual({
      text: 'Xin chào @Quốc Cường ',
      caret: 21,
    });
  });

  it('giữ nguyên phần chữ phía sau khi mention nằm giữa câu', () => {
    const text = 'Chào @Qu nhé';
    const active = findActiveMention(text, 8)!;
    const result = insertMention(text, active, 'Quốc Cường');
    expect(result.text).toBe('Chào @Quốc Cường nhé');
    // Con trỏ nằm sau khoảng trắng, không dính vào nhãn mention.
    expect(result.text.slice(result.caret)).toBe('nhé');
  });

  it('không thêm khoảng trắng thừa khi phía sau đã có sẵn', () => {
    const text = '@Qu xong';
    const active = findActiveMention(text, 3)!;
    expect(insertMention(text, active, 'Quốc Cường').text).toBe('@Quốc Cường xong');
  });
});

describe('splitMessageSegments', () => {
  const cuong: GroupMessageMention = {
    type: 'user',
    userId: 'u1',
    label: 'Quốc Cường',
  };
  const all: GroupMessageMention = { type: 'all', label: MENTION_ALL_LABEL };

  it('tin nhắn không có metadata trả về đúng một mảnh chữ thường', () => {
    expect(splitMessageSegments('Chào @Quốc Cường', undefined)).toEqual([
      { text: 'Chào @Quốc Cường', mention: null },
    ]);
  });

  it('tách mention ra khỏi phần chữ xung quanh', () => {
    expect(splitMessageSegments('Chào @Quốc Cường nhé', [cuong])).toEqual([
      { text: 'Chào ', mention: null },
      { text: '@Quốc Cường', mention: cuong },
      { text: ' nhé', mention: null },
    ]);
  });

  it('xử lý nhiều mention trong cùng một tin nhắn', () => {
    const segments = splitMessageSegments('@All và @Quốc Cường', [all, cuong]);
    expect(segments.filter((s) => s.mention).map((s) => s.text)).toEqual([
      '@All',
      '@Quốc Cường',
    ]);
  });

  it('nhãn dài được ưu tiên để không bị nhãn ngắn nuốt mất', () => {
    const an: GroupMessageMention = { type: 'user', userId: 'a', label: 'An' };
    const anNhien: GroupMessageMention = {
      type: 'user',
      userId: 'b',
      label: 'An Nhiên',
    };
    const segments = splitMessageSegments('@An Nhiên ơi', [an, anNhien]);
    expect(segments[0]).toEqual({ text: '@An Nhiên', mention: anNhien });
  });

  it('không tô đoạn @ ngẫu nhiên không khớp metadata', () => {
    expect(splitMessageSegments('gửi @ai đó', [cuong])).toEqual([
      { text: 'gửi @ai đó', mention: null },
    ]);
  });

  it('giữ nguyên xuống dòng trong phần chữ', () => {
    const segments = splitMessageSegments('@All\ndòng hai', [all]);
    expect(segments[1].text).toBe('\ndòng hai');
  });
});

describe('mentionsUser', () => {
  it('@All tính là nhắc mọi người', () => {
    expect(mentionsUser([{ type: 'all', label: 'All' }], 'bất-kỳ-ai')).toBe(true);
  });

  it('chỉ đúng với userId được nhắc', () => {
    const mentions: GroupMessageMention[] = [
      { type: 'user', userId: 'u1', label: 'A' },
    ];
    expect(mentionsUser(mentions, 'u1')).toBe(true);
    expect(mentionsUser(mentions, 'u2')).toBe(false);
  });

  it('tin nhắn không có mention thì không nhắc ai', () => {
    expect(mentionsUser(undefined, 'u1')).toBe(false);
  });
});

describe('normalizeMentions', () => {
  it('bỏ qua giá trị null của tin nhắn cũ', () => {
    expect(normalizeMentions(null)).toBeUndefined();
  });

  it('loại các phần tử sai hình dạng', () => {
    expect(
      normalizeMentions([
        { type: 'user', userId: 'u1', label: 'A' },
        { type: 'user', label: 'thiếu userId' },
        { type: 'sticker', label: 'X' },
        { type: 'all', label: '' },
      ]),
    ).toEqual([{ type: 'user', userId: 'u1', label: 'A' }]);
  });
});
