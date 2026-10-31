import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeMobileDialog } from './mobile-back';

afterEach(() => document.body.replaceChildren());
describe('Android Back on dialogs', () => {
  it('uses the top dialog cancel control without closing the dialog underneath', () => {
    document.body.innerHTML = '<section role="dialog"><button data-native-close>Close</button></section>' +
      '<section role="dialog"><button data-native-close>Close</button></section>';
    const buttons = document.querySelectorAll('button');
    const lower = vi.fn(), upper = vi.fn();
    buttons[0].addEventListener('click', lower); buttons[1].addEventListener('click', upper);
    expect(closeMobileDialog()).toBe(true);
    expect(upper).toHaveBeenCalledOnce(); expect(lower).not.toHaveBeenCalled();
  });
  it('bubbles Escape from the dialog so component and document handlers can receive it', () => {
    document.body.innerHTML = '<section role="dialog"></section>';
    const handler = vi.fn(); document.querySelector('section')!.addEventListener('keydown', handler);
    expect(closeMobileDialog()).toBe(true);
    expect(handler.mock.calls[0][0].key).toBe('Escape');
  });
  it('allows route navigation when there is no dialog', () => {
    expect(closeMobileDialog()).toBe(false);
  });
});
