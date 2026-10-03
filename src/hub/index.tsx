/**
 * The hub: the menus in front of every game (home, shop, missions, locker, daily rewards,
 * chests, settings) plus launching games and celebrating what they earn.
 */
import { render } from 'preact';
import { FEATURED_GAME_ID } from '../games/registry';
import { HubProvider, type Hub, type HubDeps } from './context';
import { createCoinFx } from './fx/coins';
import { createFeedback } from './fx/feedback';
import { createParticles } from './fx/particles';
import { createToasts } from './fx/toasts';
import { createLauncher } from './game/launcher';
import { HubView } from './HubView';
import { createStore } from './store';
import { startHubSystems } from './systems';
import '../shared/ui/kit/tokens.css';
import '../shared/ui/kit/motion.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/anim.css';

export type { HubDeps } from './context';

/** Renders the hub into `root` and starts its timers; returns a teardown function. */
export function mountHub(root: HTMLElement, deps: HubDeps): () => void {
  const { meta, audio, haptics, games } = deps;
  const initialGame = games.find((g) => g.id === FEATURED_GAME_ID)?.id ?? games[0]?.id ?? '';
  const store = createStore(initialGame);
  const toasts = createToasts();
  const coins = createCoinFx(audio, haptics);
  const particles = createParticles();
  const feedback = createFeedback(audio, haptics, toasts, coins);
  const launcher = createLauncher({
    services: { ...meta.services, audio, haptics },
    onLaunch() {
      audio.play('whoosh');
      haptics.impact('medium');
    },
    onError(game, error) {
      console.error(`[hub] ${game.title} failed to start`, error);
      toasts.show(`${game.title} couldn't start. Please try again.`, 'error');
    },
    onReturn() {
      // The game showed its own coin animations; level-up coins wait for their celebration.
      meta.coinGains.clear();
      coins.hold(meta.levelUps.pending.peek().reduce((sum, l) => sum + l.coins, 0));
      audio.setTension(0);
      audio.setMusic(true);
    },
  });

  const hub: Hub = { ...deps, store, launcher, coins, particles, toasts, feedback };
  const stopSystems = startHubSystems(hub);
  render(
    <HubProvider value={hub}>
      <HubView />
    </HubProvider>,
    root,
  );
  return () => {
    stopSystems();
    render(null, root);
  };
}
