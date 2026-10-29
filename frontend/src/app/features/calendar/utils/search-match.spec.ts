import { describe, expect, it } from 'vitest';
import { matchScore } from './search-match';

describe('Vietnamese event search', () => {
  it('finds accented titles from unaccented, mixed-case input', () => {
    expect(matchScore({ title: 'Đánh giá dự án' }, '  DANH gia  ')).toBe(1);
    expect(matchScore({ title: 'Họp nhóm' }, 'hop nhom')).toBe(0);
  });
  it('supports decomposed Unicode and extra spaces', () => {
    expect(matchScore({ title: 'Họp   nhóm'.normalize('NFD') }, 'họp nhóm')).toBe(0);
  });
  it('finds locations and descriptions', () => {
    expect(matchScore({ title: 'Review', location: 'Đà Nẵng' }, 'da nang')).toBe(4);
    expect(matchScore({ title: 'Review', description: 'Chuẩn bị báo cáo' }, 'bao cao')).toBe(7);
  });
  it('ignores blank input and preserves title ranking and typo tolerance', () => {
    expect(matchScore({ title: 'Họp' }, '   ')).toBeNull();
    expect(matchScore({ title: 'Planning' }, 'plannign')).toBe(10);
    expect(matchScore({ title: 'Unrelated' }, 'zzzzzz')).toBeNull();
  });
});
