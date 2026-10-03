/**
 * App entry: builds the platform services and the meta layer, then mounts the hub.
 */
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { createAudio } from './audio';
import { GAMES } from './games/registry';
import { mountHub } from './hub';
import { createMeta } from './meta';
import { createHaptics, createStorage, onPause, platformInfo } from './platform';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app is missing from index.html');

  const meta = await createMeta({ storage: createStorage(), games: GAMES });
  // The Electron build turns the autoplay policy off; elsewhere audio waits for a gesture.
  const audio = createAudio(meta.services.settings, { autoplay: platformInfo().kind === 'electron' });
  const haptics = createHaptics(meta.services.settings);

  // Background, minimise or close: write the save now instead of waiting for the batch timer.
  onPause(() => meta.flush());

  // iOS Safari only applies :active styles (the buttons' press-down) when a touch listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });

  mountHub(root, { meta, audio, haptics, games: GAMES });
}

boot().catch((error: unknown) => {
  console.error('[arcadium] failed to start', error);
  const root = document.getElementById('app');
  if (root) {
    root.textContent = 'Arcadium could not start. Please restart the app.';
    root.style.cssText =
      'display:grid;place-items:center;padding:24px;text-align:center;' +
      'color:#fff;background:#1b1440;font:600 18px system-ui';
  }
});
