import { isAndroidApp } from './mobile-platform';

/** A phone IME's Enter inserts a line; submitting uses the visible Send button. */
export function shouldSendOnEnter(event: KeyboardEvent, android = isAndroidApp()): boolean {
  return !android && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}
