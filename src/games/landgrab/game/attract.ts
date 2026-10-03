/**
 * The hub's background match: bots only, watched as a spectator through the renderer's
 * attract mode. Silent, capped at ~30 fps, and paused with the page (the local room's
 * timer and requestAnimationFrame both stop while hidden).
 */
import type { Disposable } from '../../../shared/game';
import { cosmeticById, DEFAULT_LOADOUT } from '../content';
import type { HelloProfile } from '../net';
import { createRenderer } from '../render';
import { connect, type Connection } from './connect';
import { startFrameLoop, type FrameLoop } from './loop';

const ATTRACT_FPS = 30;
const SPECTATOR: HelloProfile = {
  id: 'attract-spectator',
  name: 'Spectator',
  color: 0,
  cosmetics: DEFAULT_LOADOUT,
};

export function mountAttract(host: HTMLElement): Disposable {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.append(canvas);
  const renderer = createRenderer(canvas, {
    cosmetics: cosmeticById,
    screenShake: () => false,
    attract: true,
  });
  const resizer = new ResizeObserver(() => renderer.resize());
  resizer.observe(canvas);

  let connection: Connection | null = null;
  let loop: FrameLoop | null = null;
  let disposed = false;

  connect('offline', SPECTATOR, true).then(
    (joined) => {
      if (disposed) {
        joined.dispose();
        return;
      }
      connection = joined;
      const { client } = joined;
      client.onEvent((e, state) => renderer.onEvent(e, state, 0));
      loop = startFrameLoop((now) => renderer.draw(client.view(), client.alpha(now), now, 0), ATTRACT_FPS);
    },
    (error: unknown) => console.warn('[landgrab] the background match did not start', error),
  );

  return {
    dispose() {
      disposed = true;
      loop?.stop();
      connection?.dispose();
      resizer.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };
}
