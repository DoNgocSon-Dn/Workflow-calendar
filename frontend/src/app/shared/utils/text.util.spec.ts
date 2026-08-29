import {
  cleanImportedDescription,
  extractConferenceLink,
  isConferenceLinkOnly,
} from './text.util';

describe('extractConferenceLink', () => {
  it('bắt link Google Meet / Zoom / Teams', () => {
    expect(extractConferenceLink('vào họp: https://meet.google.com/mia-ymcs-idh nhé')).toBe(
      'https://meet.google.com/mia-ymcs-idh',
    );
    expect(extractConferenceLink('https://us02web.zoom.us/j/1234567890')).toBe(
      'https://us02web.zoom.us/j/1234567890',
    );
    expect(extractConferenceLink('không có link')).toBeNull();
  });
});

describe('isConferenceLinkOnly', () => {
  it('đúng khi chuỗi CHỈ là một link họp', () => {
    expect(isConferenceLinkOnly('  https://meet.google.com/abc-defg-hij  ')).toBe(true);
    expect(isConferenceLinkOnly('Phòng 301 https://meet.google.com/abc-defg-hij')).toBe(false);
    expect(isConferenceLinkOnly('')).toBe(false);
  });
});

describe('cleanImportedDescription', () => {
  it('bỏ khối phân cách + dòng boilerplate của Google Meet, giữ mô tả thật', () => {
    const raw = [
      'Buổi phỏng vấn vòng kỹ thuật.',
      '',
      '-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-',
      'Join with Google Meet: https://meet.google.com/mia-ymcs-idh',
      'Or dial: (US) +1 555-000-0000 PIN: 123 456 789#',
      '',
      'Learn more about Meet at: https://support.google.com/a/users/answer/9282720',
      '',
      'Please do not edit this section.',
      '-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-',
    ].join('\n');
    expect(cleanImportedDescription(raw)).toBe('Buổi phỏng vấn vòng kỹ thuật.');
  });

  it('giữ nguyên khi không có rác', () => {
    expect(cleanImportedDescription('Chỉ là một dòng mô tả.')).toBe('Chỉ là một dòng mô tả.');
  });
});
