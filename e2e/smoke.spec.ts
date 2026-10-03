/**
 * Smoke test: the app boots to the hub, Practice offline starts a match against bots, a
 * scripted keyboard loop out of your land and back grabs more of the map, and the game
 * canvas shows the map with your land on it.
 */
import { errors, expect, test, type Page } from '@playwright/test';
import { frameWith, MY_ROW, openHub } from './app';

/** A clockwise square; the last side runs back over the start disc. */
const SQUARE = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const;
/** Each side is held this long: ~28 cells at the default speed, twice the start disc's radius. */
const SIDE_MS = 1300;
/** How long the HUD gets to show the capture once the square is driven. */
const CAPTURE_MS = 6000;
/**
 * The map, the spawn point and the bots are random every match, so a square now and then
 * runs into the map's edge or a bot. Each attempt starts a fresh match.
 */
const ATTEMPTS = 3;

test('boots to the hub and plays an offline practice match', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', (error) => crashes.push(error.message));

  await test.step('boots to the hub', async () => {
    await openHub(page);
    await expect(page).toHaveTitle('Arcadium');
    await expect(page.getByRole('button', { name: 'Landgrab' })).toBeVisible();
  });

  await test.step('a keyboard loop out of your land and back grabs more of the map', async () => {
    for (let attempt = 1; !(await practiceLoop(page)); attempt++) {
      expect(attempt, `no loop captured land in ${ATTEMPTS} practice matches`).toBeLessThan(ATTEMPTS);
      await openHub(page);
    }
  });

  await test.step('the canvas shows the map with your land on it', async () => {
    const color = await page.locator('.lg-score').evaluate((el) => getComputedStyle(el).getPropertyValue('--me').trim());
    const sample = await sampleCanvas(page, color);
    expect(sample.colors, 'distinct colours on the canvas').toBeGreaterThan(12);
    expect(sample.ownShare, `share of the canvas in your colour ${color}`).toBeGreaterThan(0.005);
  });

  expect(crashes, 'uncaught errors in the page').toEqual([]);
});

/** Starts a practice match and drives one square from the spawn point; true once the HUD shows more of the map. */
async function practiceLoop(page: Page): Promise<boolean> {
  await test.step('Practice offline starts a match', async () => {
    await page.getByRole('button', { name: 'Practice offline' }).click();
    await frameWith(page, '.lg-hud');
  });

  // Pressed before the spawn, the first side still starts on time: the room keeps a steer until it has a head to turn.
  await page.keyboard.down(SQUARE[0]);
  await frameWith(page, MY_ROW);
  // The leaderboard row shows the start disc's share as is; the score card rolls up to it.
  const start = parseFloat((await page.locator(`${MY_ROW} .lg-board__pct`).textContent()) ?? '');
  for (let side = 0; side < SQUARE.length; side++) {
    if (side > 0) {
      await page.keyboard.up(SQUARE[side - 1]);
      await page.keyboard.down(SQUARE[side]);
    }
    // Holding a key for a set time is the steering itself, not a wait on the UI.
    await page.waitForTimeout(SIDE_MS);
  }
  await page.keyboard.up(SQUARE[SQUARE.length - 1]);

  return page
    .waitForFunction(
      (start) => parseFloat(document.querySelector('.lg-score__value')?.textContent ?? '') > start,
      start,
      { timeout: CAPTURE_MS },
    )
    .then(
      () => true,
      (error: unknown) => {
        if (error instanceof errors.TimeoutError) return false;
        throw error;
      },
    );
}

/** Reads every 7th pixel of the game canvas: how many distinct colours, and the share close to `color`. */
function sampleCanvas(page: Page, color: string): Promise<{ colors: number; ownShare: number }> {
  return page.locator('canvas.lg-canvas').evaluate((canvas: HTMLCanvasElement, hex) => {
    const own = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<number>();
    let ownPixels = 0;
    let samples = 0;
    for (let i = 0; i < data.length; i += 4 * 7) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (Math.abs(r - own[0]) + Math.abs(g - own[1]) + Math.abs(b - own[2]) < 40) ownPixels++;
      samples++;
    }
    return { colors: colors.size, ownShare: ownPixels / samples };
  }, color);
}
