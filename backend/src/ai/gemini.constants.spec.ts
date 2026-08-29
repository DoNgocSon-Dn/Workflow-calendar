import { looksLikeGeminiApiKey } from './gemini.constants';

describe('looksLikeGeminiApiKey', () => {
  it('chấp nhận định dạng cũ "AIzaSy..."', () => {
    expect(looksLikeGeminiApiKey('AIzaSyD-1234567890abcdefghijklmnopqrstuv')).toBe(true);
  });

  it('chấp nhận định dạng mới "AQ.Ab8..." của AI Studio', () => {
    expect(looksLikeGeminiApiKey('AQ.Ab8RN6_DUMMY_TEST_KEY_FOR_SPEC_12345678901234567890')).toBe(true);
  });

  it('từ chối chuỗi rỗng và giá trị giữ chỗ', () => {
    expect(looksLikeGeminiApiKey('')).toBe(false);
    expect(looksLikeGeminiApiKey('your-api-key')).toBe(false);
    expect(looksLikeGeminiApiKey('change-me')).toBe(false);
    expect(looksLikeGeminiApiKey('   ')).toBe(false);
  });

  it('từ chối chuỗi quá ngắn', () => {
    expect(looksLikeGeminiApiKey('AQ.short')).toBe(false);
  });
});
