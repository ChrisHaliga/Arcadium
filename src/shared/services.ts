/**
 * Hub-level services shared by every game in the bundle.
 *
 * CONTRACT FILE: implemented by src/meta (economy, progress, profile, cosmetics),
 * src/platform (storage, haptics) and src/audio (sound). Games only ever talk to
 * these interfaces, never to the implementations.
 *
 * Also the data games hand the hub (cosmetics, missions, player colours). No DOM types
 * here: games' data files use them and the match server imports those.
 */
import type { ReadonlySignal } from '@preact/signals';

export interface WalletService {
  readonly coins: ReadonlySignal<number>;
  add(amount: number, reason: string): void;
  /** Returns false (and changes nothing) when the balance is too low. */
  spend(amount: number, reason: string): boolean;
}

export type StatMode = 'add' | 'max';

export interface ProgressService {
  readonly level: ReadonlySignal<number>;
  /** XP earned inside the current level. */
  readonly xp: ReadonlySignal<number>;
  /** XP needed to go from the current level to the next. */
  readonly xpToNext: ReadonlySignal<number>;
  addXp(amount: number): void;
  /**
   * Feed a gameplay stat into the mission system.
   * 'add' accumulates (e.g. kills), 'max' keeps the best single value (e.g. peak % in one round).
   */
  report(gameId: string, stat: string, value: number, mode: StatMode): void;
}

export type CosmeticKind = 'skin' | 'trail' | 'capture' | 'kill';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CosmeticDef {
  id: string;
  gameId: string;
  kind: CosmeticKind;
  name: string;
  rarity: Rarity;
  /** Renderer hint; each game interprets its own styles. */
  style: string;
  /** Optional extra colours/params for the style. */
  params?: Record<string, string | number>;
}

export interface MissionDef {
  id: string;
  gameId: string;
  /** Short imperative, e.g. "Own 30% of the map in one round". */
  title: string;
  /** Stat name reported through ProgressService.report. */
  stat: string;
  mode: StatMode;
  target: number;
  cadence: 'daily' | 'weekly';
  reward: number;
}

export interface Loadout {
  skin: string;
  trail: string;
  capture: string;
  kill: string;
}

export interface CosmeticsService {
  readonly catalog: readonly CosmeticDef[];
  readonly owned: ReadonlySignal<ReadonlySet<string>>;
  get(id: string): CosmeticDef | undefined;
  isOwned(id: string): boolean;
  grant(id: string): void;
}

/** One colour of a game's player palette, as the hub shows it too: a name and three shades. */
export interface PlayerColor {
  name: string;
  base: string;
  light: string;
  dark: string;
}

export interface ProfileService {
  readonly name: ReadonlySignal<string>;
  /** Index into the game's player colours (GameModule.playerColors), wrapped to their count. */
  readonly color: ReadonlySignal<number>;
  /** Stable random id for this install (used as the player id online). */
  readonly playerId: string;
  loadout(gameId: string): Loadout;
  setName(name: string): void;
  setColor(color: number): void;
  equip(gameId: string, kind: CosmeticKind, id: string): void;
}

export type SfxId =
  | 'click' | 'hover' | 'whoosh' | 'error'
  | 'coin' | 'coinBig' | 'capture' | 'bigCapture' | 'combo'
  | 'kill' | 'death' | 'feat' | 'milestone' | 'treasure' | 'closeCall'
  | 'reelSpin' | 'reelStop' | 'jackpot'
  | 'levelUp' | 'chestShake' | 'chestOpen' | 'reward'
  | 'revive' | 'countdown' | 'win';

export interface AudioService {
  /** pitch: playback-rate style multiplier (1 = normal). volume: 0..1 scale on top of settings. */
  play(id: SfxId, opts?: { pitch?: number; volume?: number }): void;
  /** 0..1 — drives the in-match tension layer (0 = calm, silent layer). */
  setTension(level: number): void;
  /** Background music on/off (the music itself is generated). */
  setMusic(on: boolean): void;
  /** Must be called from a user gesture once; safe to call repeatedly. */
  unlock(): void;
}

export interface HapticsService {
  impact(strength: 'light' | 'medium' | 'heavy'): void;
  notify(kind: 'success' | 'warning' | 'error'): void;
}

export interface SettingsService {
  readonly sfxVolume: ReadonlySignal<number>;
  readonly musicVolume: ReadonlySignal<number>;
  readonly haptics: ReadonlySignal<boolean>;
  readonly screenShake: ReadonlySignal<boolean>;
  set<K extends 'sfxVolume' | 'musicVolume' | 'haptics' | 'screenShake'>(
    key: K,
    value: K extends 'sfxVolume' | 'musicVolume' ? number : boolean,
  ): void;
}

/** Everything a game receives when launched from the hub. */
export interface GameServices {
  wallet: WalletService;
  progress: ProgressService;
  profile: ProfileService;
  cosmetics: CosmeticsService;
  audio: AudioService;
  haptics: HapticsService;
  settings: SettingsService;
  /** Return to the hub (the hub disposes the game). */
  exit(): void;
}

/** Persistence backend; the platform layer picks one per target (web, Electron, Capacitor). */
export interface StorageAdapter {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
}
