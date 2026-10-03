/**
 * The in-match UI state: signals the game session writes and the Preact overlays read,
 * plus the actions the overlays call back into the session. A few elements are driven
 * straight from the frame loop instead of through signals (the pending-coins bubble
 * follows the head every frame; the minimap is a canvas).
 */
import { computed, signal } from '@preact/signals';
import type { AudioService, HapticsService, ProgressService, SettingsService, WalletService } from '../../../shared/services';
import type { ComboState, LifeResult, MomentKind } from '../rewards';

export type MatchMode = 'online' | 'offline';

/** Full-screen states that replace the match. */
export type Screen =
  | { kind: 'connecting'; mode: MatchMode }
  /** Online play couldn't reach any server. */
  | { kind: 'serversDown' }
  | { kind: 'disconnected'; reason: string }
  | { kind: 'match' };

/**
 * The overlay on top, which has the keyboard and pad while it is up: a full-screen state,
 * the pause menu, the second-chance offer or the results.
 */
export type Dialog = 'screen' | 'pause' | 'secondChance' | 'results';

/**
 * Where the player's life is: waiting to spawn, playing, down (second chance on offer),
 * ended (the death plays out before results), or looking at results.
 */
export type LifeView = 'waiting' | 'alive' | 'down' | 'ended' | 'results';

export interface ScoreView {
  permille: number;
  /** 0 while not on the leaderboard (dead or waiting). */
  rank: number;
  players: number;
  /** The player's own colours, for the score card. */
  color: string;
  edge: string;
}

export interface LeaderRow {
  slot: number;
  rank: number;
  name: string;
  permille: number;
  color: string;
  edge: string;
  me: boolean;
}

export interface CalloutView {
  id: number;
  kind: MomentKind;
  title: string;
  detail: string;
  coins: number;
  roll: { multiplier: number; faces: readonly number[] } | null;
}

export interface FeedLine {
  id: number;
  text: string;
  coins: number;
}

export interface SecondChanceView {
  price: number;
  /** Coins missing to afford it; 0 when affordable. */
  shortBy: number;
  keptPermille: number;
  revivesLeft: number;
  /** GameUi.clock() when the window closes. */
  deadline: number;
  windowMs: number;
  /** The request is on its way to the host. */
  pending: boolean;
}

export interface ResultsView {
  /** Unique per life, so a new results screen starts its animation afresh. */
  id: number;
  result: LifeResult;
  walletBefore: number;
  levelBefore: number;
  xpBefore: number;
  xpToNextBefore: number;
}

export interface RoundView {
  winner: string;
  winnerColor: string;
  me: boolean;
  /** GameUi.clock() when the next map starts. */
  nextAt: number;
}

export interface UiActions {
  playAgain(): void;
  exitToHub(): void;
  revive(): void;
  declineRevive(): void;
  pause(): void;
  resume(): void;
  /** Leave mid-life: the life's coins are banked without bonus spins, then back to the hub. */
  quit(): void;
  /** Connect again in the mode that failed or dropped. */
  retry(): void;
  playOffline(): void;
}

export type UiServices = {
  audio: AudioService;
  haptics: HapticsService;
  settings: SettingsService;
  wallet: WalletService;
  progress: ProgressService;
};

const NO_SCORE: ScoreView = {
  permille: 0,
  rank: 0,
  players: 0,
  color: '#8f5bff',
  edge: '#5a2bc0',
};
const CALLOUT_MS = 1900;
const ROLL_CALLOUT_MS = 2600;
const FEED_MS = 4200;
const MAX_CALLOUTS = 2;
const MAX_FEED = 3;

export class GameUi {
  readonly screen = signal<Screen>({ kind: 'connecting', mode: 'offline' });
  readonly mode = signal<MatchMode>('offline');
  readonly life = signal<LifeView>('waiting');
  /** The pause menu is open. */
  readonly paused = signal(false);
  /** The match itself is on hold (an offline pause): countdowns that follow it stand still. */
  readonly frozen = signal(false);
  readonly score = signal<ScoreView>(NO_SCORE);
  readonly leaders = signal<readonly LeaderRow[]>([]);
  /** This life's coins that have landed in the counter. */
  readonly coins = signal(0);
  readonly combo = signal<ComboState>({ level: 0, multiplier: 1, left: 0 });
  /** What the current loop is worth; 0 hides the bubble. */
  readonly pending = signal(0);
  readonly callouts = signal<readonly CalloutView[]>([]);
  readonly feed = signal<readonly FeedLine[]>([]);
  /** Bumped on each kill for the screen flash. */
  readonly flash = signal(0);
  readonly secondChance = signal<SecondChanceView | null>(null);
  readonly results = signal<ResultsView | null>(null);
  readonly round = signal<RoundView | null>(null);

  /** The dialog on top, or null while the player is steering. */
  readonly dialog = computed((): Dialog | null => {
    if (this.screen.value.kind !== 'match') return 'screen';
    if (this.paused.value) return 'pause';
    if (this.secondChance.value) return 'secondChance';
    return this.results.value ? 'results' : null;
  });

  /**
   * The level each sound had when the pause menu's toggle silenced it, brought back when
   * it switches on. A sound that was already silent (turned down in the hub) comes back at
   * half the slider: the hub's own defaults live in its settings layer, not here.
   */
  readonly restoreVolume = { sfxVolume: 0.5, musicVolume: 0.5 };

  /** Elements the frame loop and coin bursts need, registered by the components that own them. */
  coinCounter: HTMLElement | null = null;
  pendingBubble: HTMLElement | null = null;
  minimap: HTMLCanvasElement | null = null;

  private nextId = 1;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private frozenAt = 0;
  private frozenMs = 0;

  constructor(
    readonly actions: UiActions,
    readonly services: UiServices,
  ) {}

  /**
   * Match time in ms: performance.now() less the time the match has spent frozen. Deadlines
   * that follow the simulation (the second chance, the next map) count in it.
   */
  clock(): number {
    return (this.frozen.peek() ? this.frozenAt : performance.now()) - this.frozenMs;
  }

  /** Holds or restarts the match clock, together with an offline pause. */
  freeze(frozen: boolean): void {
    if (frozen === this.frozen.peek()) return;
    if (frozen) this.frozenAt = performance.now();
    else this.frozenMs += performance.now() - this.frozenAt;
    this.frozen.value = frozen;
  }

  /** Escape or pad B: steps back out of the dialog on top. */
  back(): void {
    switch (this.dialog.peek()) {
      case 'pause':
        this.actions.resume();
        return;
      case 'secondChance':
        this.actions.declineRevive();
        return;
      case 'screen':
      case 'results':
        this.actions.exitToHub();
        return;
      case null:
        return;
    }
  }

  showCallout(callout: Omit<CalloutView, 'id'>): void {
    const view: CalloutView = { ...callout, id: this.nextId++ };
    this.callouts.value = [...this.callouts.value, view].slice(-MAX_CALLOUTS);
    this.later(callout.roll ? ROLL_CALLOUT_MS : CALLOUT_MS, () => {
      this.callouts.value = this.callouts.value.filter((c) => c.id !== view.id);
    });
  }

  addFeedLine(text: string, coins: number): void {
    const line: FeedLine = { id: this.nextId++, text, coins };
    this.feed.value = [...this.feed.value, line].slice(-MAX_FEED);
    this.later(FEED_MS, () => {
      this.feed.value = this.feed.value.filter((l) => l.id !== line.id);
    });
  }

  /** Clears everything tied to one life or one connection. */
  resetMatch(): void {
    this.life.value = 'waiting';
    this.paused.value = false;
    this.freeze(false);
    this.score.value = NO_SCORE;
    this.leaders.value = [];
    this.coins.value = 0;
    this.combo.value = { level: 0, multiplier: 1, left: 0 };
    this.pending.value = 0;
    this.callouts.value = [];
    this.feed.value = [];
    this.secondChance.value = null;
    this.results.value = null;
    this.round.value = null;
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private later(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }
}
