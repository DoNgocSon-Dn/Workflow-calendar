/** Deliver Back to the visible dialog, keeping each form's own cancel behavior. */
export function closeMobileDialog(root: Document = document): boolean {
  const dialog = Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"]')).at(-1);
  if (!dialog) return false;
  const close = dialog.querySelector<HTMLButtonElement>('button[data-native-close]');
  if (close && !close.disabled) close.click();
  else dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}
