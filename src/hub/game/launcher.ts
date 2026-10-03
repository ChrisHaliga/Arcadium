/**
 * Launching a game from the hub and coming back. A curtain in the game's accent colour
 * irises out from the Play button, the game mounts underneath it, and the curtain lifts;
 * leaving runs the same steps backwards before the game is disposed.
 */
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Disposable, GameModule, LaunchOptions } from '../../shared/game';
import type { GameServices } from '../../shared/services';
import type { Point } from '../fx/coins';

/**
 * idle → opening (curtain covers the hub) → running (game mounted, curtain lifts)
 *      → closing (curtain covers the game) → returning (hub back, curtain shrinks) → idle
 */
export type LaunchPhase = 'idle' | 'opening' | 'running' | 'closing' | 'returning';

export interface GameSession {
  game: GameModule;
  mode: LaunchOptions['mode'];
  /** Where the curtain grows from and shrinks back to. */
  origin: Point;
}

export interface Launcher {
  readonly phase: ReadonlySignal<LaunchPhase>;
  readonly session: ReadonlySignal<GameSession | null>;
  /** The game owns the screen: hub chrome is unmounted and hub input is off. */
  readonly gameActive: ReadonlySignal<boolean>;
  setHost(host: HTMLElement | null): void;
  launch(game: GameModule, mode: LaunchOptions['mode'], from: Element | null): void;
  /** What the game's services.exit() calls. Safe to call more than once. */
  exit(): void;
}

export interface LauncherHooks {
  services: Omit<GameServices, 'exit'>;
  /** The curtain starts to close over the hub. */
  onLaunch(game: GameModule): void;
  /** The game failed to start; the hub is already on its way back. */
  onError(game: GameModule, error: unknown): void;
  /** The game was disposed and the hub is about to reappear. */
  onReturn(): void;
}

/** Matches the curtain animations in game.css. */
export const CURTAIN_MS = 420;

export function createLauncher(hooks: LauncherHooks): Launcher {
  const phase = signal<LaunchPhase>('idle');
  const session = signal<GameSession | null>(null);
  let host: HTMLElement | null = null;
  let running: Disposable | null = null;

  const after = (ms: number, next: () => void) => setTimeout(next, ms);

  const finishReturn = () => {
    running?.dispose();
    running = null;
    host?.replaceChildren();
    hooks.onReturn();
    phase.value = 'returning';
    after(CURTAIN_MS, () => {
      phase.value = 'idle';
      session.value = null;
    });
  };

  const exit = () => {
    if (phase.value !== 'running') return;
    phase.value = 'closing';
    after(CURTAIN_MS, finishReturn);
  };

  const start = (current: GameSession) => {
    phase.value = 'running';
    try {
      if (!host) throw new Error('game host is not mounted');
      running = current.game.launch(host, { ...hooks.services, exit }, { mode: current.mode });
    } catch (error) {
      hooks.onError(current.game, error);
      finishReturn();
    }
  };

  return {
    phase,
    session,
    gameActive: computed(() => phase.value === 'running' || phase.value === 'closing'),
    setHost(el) {
      host = el;
    },
    launch(game, mode, from) {
      if (phase.value !== 'idle' || !game.available) return;
      const r = from?.getBoundingClientRect();
      const origin = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
      const current = { game, mode, origin };
      session.value = current;
      phase.value = 'opening';
      hooks.onLaunch(game);
      after(CURTAIN_MS, () => start(current));
    },
    exit,
  };
}
