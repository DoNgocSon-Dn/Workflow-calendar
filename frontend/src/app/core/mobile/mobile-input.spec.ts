import { describe, expect, it } from 'vitest';
import { shouldSendOnEnter } from './mobile-input';

describe('mobile and desktop message input', () => {
  it('preserves phone newlines while keeping desktop Enter to send', () => {
    const enter = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(shouldSendOnEnter(enter, true)).toBe(false);
    expect(shouldSendOnEnter(enter, false)).toBe(true);
    expect(shouldSendOnEnter(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }), false)).toBe(false);
  });
  it('never sends while Vietnamese IME is composing or when another key is pressed', () => {
    expect(shouldSendOnEnter(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }), false)).toBe(false);
    const ime = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 });
    expect(shouldSendOnEnter(ime, false)).toBe(false);
    expect(shouldSendOnEnter(new KeyboardEvent('keydown', { key: 'a' }), false)).toBe(false);
  });
});
