/**
 * What the e2e specs share: opening the hub and finding yourself in a match.
 */
import { expect, type Page } from '@playwright/test';

/** Your own row on the in-match leaderboard; it is there from the moment you spawn. */
export const MY_ROW = '.lg-board__row--me';

/** Opens the app and waits until the hub's home screen takes clicks. */
export async function openHub(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Practice offline' })).toBeEnabled();
}

/**
 * Resolves on the first animation frame where `selector` matches. Locator waits poll with
 * back-off (up to 500 ms apart), which is too coarse once the player is already moving.
 */
export async function frameWith(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((s) => document.querySelector(s) !== null, selector, { polling: 'raf' });
}
