/** Deliver Back to the visible dialog, keeping each form's own cancel behavior. */
export function closeMobileDialog(root: Document = document): boolean {
  const dialog = Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"]')).at(-1);
  if (!dialog) {
    // Menus, drawers and the selected chat are transient screens too. Their
    // own click handler preserves state, rather than navigating out of the app.
    const dismiss = Array.from(root.querySelectorAll<HTMLElement>('[data-native-back]')).at(-1);
    if (!dismiss) return false;
    dismiss.click();
    return true;
  }
  const close = dialog.querySelector<HTMLButtonElement>('button[data-native-close]');
  if (close && !close.disabled) close.click();
  else dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}
