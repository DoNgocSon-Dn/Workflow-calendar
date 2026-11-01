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
  it('dismisses a menu before leaving a selected chat or drawer', () => {
    document.body.innerHTML = '<button data-native-back>Chat back</button><div data-native-back>Menu backdrop</div>';
    const lower = vi.fn(), upper = vi.fn();
    const layers = document.querySelectorAll<HTMLElement>('[data-native-back]');
    layers[0].addEventListener('click', lower); layers[1].addEventListener('click', upper);
    expect(closeMobileDialog()).toBe(true);
    expect(upper).toHaveBeenCalledOnce(); expect(lower).not.toHaveBeenCalled();
  });
  it('closes a confirmation first and leaves the drawer underneath intact', () => {
    document.body.innerHTML = '<div data-native-back>Drawer</div><section role="dialog"><button data-native-close>Cancel</button></section>';
    const drawer = vi.fn(), cancel = vi.fn();
    document.querySelector('[data-native-back]')!.addEventListener('click', drawer);
    document.querySelector('button')!.addEventListener('click', cancel);
    expect(closeMobileDialog()).toBe(true);
    expect(cancel).toHaveBeenCalledOnce(); expect(drawer).not.toHaveBeenCalled();
  });
});
