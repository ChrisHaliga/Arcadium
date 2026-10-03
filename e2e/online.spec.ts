/**
 * Online: two players press Play against a real match server (playwright.config.ts starts
 * one on a test port and points the client at it) and end up in the same room.
 */
import { expect, test, type Page } from '@playwright/test';
import { MY_ROW, openHub } from './app';

/** Where the page keeps the strings it drew on a canvas (see recordCanvasText). */
const CANVAS_TEXT = '__canvasText';

test('two players who press Play meet in the same room', async ({ browser }) => {
  // A context each: separate saves, so two installs with their own player id and name.
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const players = await Promise.all(
      contexts.map(async (context) => {
        await context.addInitScript(recordCanvasText, CANVAS_TEXT);
        const page = await context.newPage();
        await openHub(page);
        return page;
      }),
    );
    // The text as stored, like the leaderboard and name tags hold it (innerText would follow CSS).
    const names = await Promise.all(players.map((page) => page.locator('.topbar__name').textContent()));
    expect(names[0], 'both installs rolled the same random name').not.toBe(names[1]);

    // The Play button breathes forever, so it never holds still for Playwright's stability check.
    await Promise.all(players.map((page) => page.getByRole('button', { name: /^play/i }).click({ force: true })));

    for (const [i, page] of players.entries()) {
      const other = names[1 - i];
      await expect(page.locator(MY_ROW), `${names[i]} is in an online match`).toBeVisible();
      await expect.poll(() => namesShown(page), { message: `${names[i]} sees ${other}` }).toContain(other);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

/**
 * Everyone the page shows by name: the leaderboard (top five only) and the name tags the
 * renderer paints for every player on the map.
 */
async function namesShown(page: Page): Promise<string[]> {
  const board = await page.locator('.lg-board__name').allTextContents();
  const tags = await page.evaluate((key) => [...(window as unknown as Record<string, Set<string>>)[key]], CANVAS_TEXT);
  return [...board, ...tags];
}

/** Runs in the page before the app: remembers every string drawn with fillText, as the map's name tags are. */
function recordCanvasText(key: string): void {
  const drawn = new Set<string>();
  Object.defineProperty(window, key, { value: drawn });
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof fillText>) {
    drawn.add(args[0]);
    fillText.apply(this, args);
  };
}
