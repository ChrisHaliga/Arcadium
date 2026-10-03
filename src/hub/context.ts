/** Everything hub components share, provided once at the root and read with useHub(). */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Meta } from '../meta';
import type { GameModule } from '../shared/game';
import type { AudioService, HapticsService } from '../shared/services';
import type { CoinFx } from './fx/coins';
import type { Feedback } from './fx/feedback';
import type { Particles } from './fx/particles';
import type { Toasts } from './fx/toasts';
import type { Launcher } from './game/launcher';
import type { HubStore } from './store';

/** What the app shell hands the hub. */
export interface HubDeps {
  meta: Meta;
  audio: AudioService;
  haptics: HapticsService;
  /** Carousel order; the same list the meta layer was created with. */
  games: readonly GameModule[];
}

export interface Hub extends HubDeps {
  store: HubStore;
  launcher: Launcher;
  coins: CoinFx;
  particles: Particles;
  toasts: Toasts;
  feedback: Feedback;
}

const HubContext = createContext<Hub | null>(null);

export const HubProvider = HubContext.Provider;

export function useHub(): Hub {
  const hub = useContext(HubContext);
  if (!hub) throw new Error('useHub() outside the hub');
  return hub;
}
