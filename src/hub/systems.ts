/**
 * Hub behaviour that runs outside any one component: the countdown clock and daily
 * rollover, draining the meta layer's celebration queues, music, and the Android back button.
 */
import { effect, untracked } from '@preact/signals';
import { exitApp, onBackButton, onResume } from '../platform';
import type { Hub } from './context';

const CLOCK_MS = 1000;

export function startHubSystems(hub: Hub): () => void {
  const { meta, store, launcher, coins, audio } = hub;

  const tick = () => {
    meta.refresh();
    store.tick(Date.now());
  };
  const clock = setInterval(tick, CLOCK_MS);
  const stopResume = onResume(tick);

  // Wallet gains fly into the counter, except while a game owns the screen (it animates its own).
  const stopCoins = effect(() => {
    if (meta.coinGains.pending.value.length === 0 || launcher.gameActive.value) return;
    untracked(() => {
      for (let gain = meta.coinGains.shift(); gain; gain = meta.coinGains.shift()) coins.receive(gain);
    });
  });

  // Level-ups are celebrated one at a time once the hub is back and nothing else is open.
  const stopLevelUps = effect(() => {
    if (meta.levelUps.pending.value.length === 0) return;
    if (launcher.phase.value !== 'idle' || store.overlays.value.length > 0) return;
    untracked(() => {
      const levelUp = meta.levelUps.shift();
      if (levelUp) store.open({ kind: 'levelUp', levelUp });
    });
  });

  const stopBack = onBackButton(() => {
    if (launcher.gameActive.peek()) launcher.exit();
    else if (!store.back()) exitApp();
  });

  audio.setMusic(true);

  return () => {
    clearInterval(clock);
    stopResume();
    stopCoins();
    stopLevelUps();
    stopBack();
  };
}
