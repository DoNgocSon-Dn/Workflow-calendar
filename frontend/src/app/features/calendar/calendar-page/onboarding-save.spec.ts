import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './calendar-page';

function setup(nameError: unknown = null, dobFails = false) {
  const updateDisplayName = vi.fn(async () => nameError);
  const setUserDob = vi.fn(async () => { if (dobFails) throw new Error('metadata save failed'); });
  const page = {
    onboardingCanSubmit: () => true, savingName: signal(false), onboardingError: signal<string | null>(null),
    namePromptOpen: signal(true), nameDraft: signal(' Son '), dobDraft: signal('2000-01-01'),
    authStore: { updateDisplayName }, birthdayService: { setUserDob }, i18n: { t: (key: string) => key },
  };
  return { page, updateDisplayName, setUserDob,
    save: () => CalendarPage.prototype.completeOnboarding.call(page as unknown as CalendarPage) };
}

describe('first-run profile persistence', () => {
  it('keeps the form and drafts visible when the auth API returns an error', async () => {
    const { page, setUserDob, save } = setup({ message: 'request failed' });
    await save();
    expect(page.namePromptOpen()).toBe(true);
    expect(page.onboardingError()).toBe('onboarding.saveFailed');
    expect(page.nameDraft()).toBe(' Son ');
    expect(page.savingName()).toBe(false);
    expect(setUserDob).not.toHaveBeenCalled();
  });
  it('keeps the form open if saving the birthday fails', async () => {
    const { page, save } = setup(null, true);
    await save();
    expect(page.namePromptOpen()).toBe(true);
    expect(page.onboardingError()).toBeTruthy();
    expect(page.dobDraft()).toBe('2000-01-01');
    expect(page.savingName()).toBe(false);
  });
  it('closes the form only after both profile fields have persisted', async () => {
    const { page, updateDisplayName, setUserDob, save } = setup();
    await save();
    expect(updateDisplayName).toHaveBeenCalledWith('Son');
    expect(setUserDob).toHaveBeenCalledWith('2000-01-01');
    expect(page.namePromptOpen()).toBe(false);
    expect(page.onboardingError()).toBeNull();
  });
});
