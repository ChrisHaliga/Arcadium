/**
 * The on-device save file: format, defaults, migration and persistence.
 *
 * Coins and unlocks live only on the device (no accounts, no server economy), so a
 * damaged or half-written save must never brick the app or wipe progress silently:
 * every field is validated on its own and falls back to its default, and a save that
 * can't be parsed at all is copied aside before a fresh one replaces it.
 */
import { cleanName } from '../shared/names';
import type { Loadout, StorageAdapter } from '../shared/services';
import { CHESTS, DAILY, PROFILE, SAVE, SETTINGS_DEFAULTS, WALLET, type ChestType } from './config';
import { randomName } from './names';
import { newPlayerId } from './random';
import { isDayKey, isWeekKey } from './time';

export const SAVE_VERSION = 1;

export interface ProfileData {
  name: string;
  color: number;
  /** Only games whose loadout the player changed have an entry; others use the game's default. */
  loadouts: Record<string, Loadout>;
}

export interface MissionSlot {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface MissionPeriod {
  /** Day key (daily) or ISO week key (weekly) the slots were drawn for; '' before the first draw. */
  key: string;
  slots: MissionSlot[];
}

export interface MissionsData {
  daily: MissionPeriod;
  weekly: MissionPeriod;
  /** Day the reroll counter belongs to; the free reroll comes back when it changes. */
  rerollDay: string;
  rerollsUsed: number;
}

export interface DailyData {
  /** Day key of the most recent claim. */
  lastClaim: string | null;
  /** Latest day that counts toward the streak: a claim, or a missed day bridged by a freeze. */
  coveredThrough: string | null;
  /** Calendar day (1..7) of the most recent claim in the current streak; 0 = next claim is day 1. */
  cycleDay: number;
  /** Claims in the current streak. */
  streak: number;
  freezes: number;
  /** What the most recent rollover did, so the hub can say "streak saved" or "streak lost" that day. */
  lastRollover: { day: string; freezesUsed: number; streakLost: number } | null;
}

export interface ShopData {
  /** Day key the rotation was drawn for; '' before the first draw. */
  day: string;
  /** Cosmetic ids on sale that day, kept fixed so buying one doesn't reshuffle the rest. */
  items: string[];
  /** Every cosmetic id ever bought from the shop. */
  purchases: string[];
}

export interface Settings {
  sfxVolume: number;
  musicVolume: number;
  haptics: boolean;
  screenShake: boolean;
}

export interface LifetimeStats {
  coinsEarned: number;
  coinsSpent: number;
  chestsOpened: number;
  missionsClaimed: number;
  dailyClaims: number;
  bestStreak: number;
  itemsBought: number;
  /** Per game, the lifetime total of every 'add' stat it reports through ProgressService.report. */
  games: Record<string, Record<string, number>>;
}

export type ChestCounts = Record<ChestType, number>;

export interface SaveData {
  version: typeof SAVE_VERSION;
  playerId: string;
  createdAt: number;
  profile: ProfileData;
  coins: number;
  /** Fractional because games award XP per coin; levels are derived from it. */
  totalXp: number;
  owned: string[];
  /** Chests earned (daily day 7, level-ups) and not opened yet. */
  chests: ChestCounts;
  missions: MissionsData;
  daily: DailyData;
  shop: ShopData;
  settings: Settings;
  stats: LifetimeStats;
}

export interface SaveEnv {
  now: () => number;
  random: () => number;
}

const CHEST_TYPES = Object.keys(CHESTS) as ChestType[];

const emptyChests = (): ChestCounts =>
  Object.fromEntries(CHEST_TYPES.map((type) => [type, 0])) as ChestCounts;

export function defaultSave(env: SaveEnv): SaveData {
  return {
    version: SAVE_VERSION,
    playerId: newPlayerId(),
    createdAt: env.now(),
    profile: {
      name: randomName(env.random),
      color: Math.floor(env.random() * PROFILE.colorChoices),
      loadouts: {},
    },
    coins: WALLET.startingCoins,
    totalXp: 0,
    owned: [],
    chests: emptyChests(),
    missions: {
      daily: { key: '', slots: [] },
      weekly: { key: '', slots: [] },
      rerollDay: '',
      rerollsUsed: 0,
    },
    daily: { lastClaim: null, coveredThrough: null, cycleDay: 0, streak: 0, freezes: 0, lastRollover: null },
    shop: { day: '', items: [], purchases: [] },
    settings: { ...SETTINGS_DEFAULTS },
    stats: {
      coinsEarned: 0,
      coinsSpent: 0,
      chestsOpened: 0,
      missionsClaimed: 0,
      dailyClaims: 0,
      bestStreak: 0,
      itemsBought: 0,
      games: {},
    },
  };
}

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const record = (v: unknown): Json => (isRecord(v) ? v : {});

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const int = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  finite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;

const real = (v: unknown, fallback: number, min: number, max: number): number =>
  finite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length > 0 ? v : fallback);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))] : [];

const dayOrNull = (v: unknown): string | null => (typeof v === 'string' && isDayKey(v) ? v : null);

const numberMap = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(record(v)).filter((entry): entry is [string, number] => finite(entry[1])));

function sanitizeLoadout(v: unknown): Loadout | null {
  const r = record(v);
  const { skin, trail, capture, kill } = r;
  return typeof skin === 'string' && typeof trail === 'string' && typeof capture === 'string' && typeof kill === 'string'
    ? { skin, trail, capture, kill }
    : null;
}

function sanitizeProfile(v: unknown, fresh: ProfileData): ProfileData {
  const r = record(v);
  const loadouts: Record<string, Loadout> = {};
  for (const [gameId, raw] of Object.entries(record(r.loadouts))) {
    const loadout = sanitizeLoadout(raw);
    if (loadout) loadouts[gameId] = loadout;
  }
  const name = typeof r.name === 'string' ? cleanName(r.name) : '';
  return { name: name || fresh.name, color: int(r.color, fresh.color), loadouts };
}

function sanitizePeriod(v: unknown, isKey: (key: string) => boolean): MissionPeriod {
  const r = record(v);
  const key = typeof r.key === 'string' && isKey(r.key) ? r.key : '';
  const slots: MissionSlot[] = [];
  for (const raw of Array.isArray(r.slots) ? r.slots : []) {
    const s = record(raw);
    if (typeof s.id !== 'string' || slots.some((slot) => slot.id === s.id)) continue;
    slots.push({ id: s.id, progress: real(s.progress, 0, 0, Number.MAX_SAFE_INTEGER), claimed: bool(s.claimed, false) });
  }
  return { key, slots };
}

function sanitizeMissions(v: unknown): MissionsData {
  const r = record(v);
  return {
    daily: sanitizePeriod(r.daily, isDayKey),
    weekly: sanitizePeriod(r.weekly, isWeekKey),
    rerollDay: dayOrNull(r.rerollDay) ?? '',
    rerollsUsed: int(r.rerollsUsed, 0),
  };
}

function sanitizeDaily(v: unknown, fresh: DailyData): DailyData {
  const r = record(v);
  const note = record(r.lastRollover);
  const noteDay = dayOrNull(note.day);
  return {
    lastClaim: dayOrNull(r.lastClaim),
    coveredThrough: dayOrNull(r.coveredThrough),
    cycleDay: int(r.cycleDay, fresh.cycleDay, 0, 7),
    streak: int(r.streak, fresh.streak),
    freezes: int(r.freezes, fresh.freezes, 0, DAILY.maxFreezes),
    lastRollover: noteDay
      ? { day: noteDay, freezesUsed: int(note.freezesUsed, 0), streakLost: int(note.streakLost, 0) }
      : null,
  };
}

function sanitizeShop(v: unknown): ShopData {
  const r = record(v);
  return { day: dayOrNull(r.day) ?? '', items: strings(r.items), purchases: strings(r.purchases) };
}

/** Also used for live updates, so a bad value from the UI can't poison the save. */
export function sanitizeSettings(v: unknown, fallback: Settings = SETTINGS_DEFAULTS): Settings {
  const r = record(v);
  return {
    sfxVolume: real(r.sfxVolume, fallback.sfxVolume, 0, 1),
    musicVolume: real(r.musicVolume, fallback.musicVolume, 0, 1),
    haptics: bool(r.haptics, fallback.haptics),
    screenShake: bool(r.screenShake, fallback.screenShake),
  };
}

function sanitizeStats(v: unknown, fresh: LifetimeStats): LifetimeStats {
  const r = record(v);
  const games: Record<string, Record<string, number>> = {};
  for (const [gameId, stats] of Object.entries(record(r.games))) games[gameId] = numberMap(stats);
  return {
    coinsEarned: int(r.coinsEarned, fresh.coinsEarned),
    coinsSpent: int(r.coinsSpent, fresh.coinsSpent),
    chestsOpened: int(r.chestsOpened, fresh.chestsOpened),
    missionsClaimed: int(r.missionsClaimed, fresh.missionsClaimed),
    dailyClaims: int(r.dailyClaims, fresh.dailyClaims),
    bestStreak: int(r.bestStreak, fresh.bestStreak),
    itemsBought: int(r.itemsBought, fresh.itemsBought),
    games,
  };
}

function sanitizeChests(v: unknown): ChestCounts {
  const r = record(v);
  const counts = emptyChests();
  for (const type of CHEST_TYPES) counts[type] = int(r[type], 0);
  return counts;
}

/**
 * Brings any parsed save up to the current format. Version 1 is the first format, so
 * today that means validating every field; a future v2 adds an upgrade step from v1
 * here before validation. Saves from a newer app (e.g. a cloud backup restored onto an
 * older install) are read best-effort through the same validation.
 */
export function migrate(raw: unknown, fresh: SaveData): SaveData {
  if (!isRecord(raw)) return fresh;
  return {
    version: SAVE_VERSION,
    playerId: text(raw.playerId, fresh.playerId),
    createdAt: int(raw.createdAt, fresh.createdAt),
    profile: sanitizeProfile(raw.profile, fresh.profile),
    coins: int(raw.coins, fresh.coins),
    totalXp: real(raw.totalXp, fresh.totalXp, 0, Number.MAX_SAFE_INTEGER),
    owned: strings(raw.owned),
    chests: sanitizeChests(raw.chests),
    missions: sanitizeMissions(raw.missions),
    daily: sanitizeDaily(raw.daily, fresh.daily),
    shop: sanitizeShop(raw.shop),
    settings: sanitizeSettings(raw.settings),
    stats: sanitizeStats(raw.stats, fresh.stats),
  };
}

export interface LoadedSave {
  data: SaveData;
  /**
   * False when the storage backend itself failed to read. The session then runs on a
   * fresh save without writing, so a transient read error can't overwrite real progress.
   */
  writable: boolean;
}

export async function loadSave(storage: StorageAdapter, env: SaveEnv): Promise<LoadedSave> {
  const fresh = defaultSave(env);
  let stored: string | null;
  try {
    stored = await storage.load(SAVE.key);
  } catch (err) {
    console.warn('[meta] could not read the save; playing without saving this session', err);
    return { data: fresh, writable: false };
  }
  if (stored === null) return { data: fresh, writable: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    console.warn('[meta] save is unreadable; starting fresh and keeping a copy at', SAVE.corruptKey);
    await storage.save(SAVE.corruptKey, stored).catch(() => undefined);
    return { data: fresh, writable: true };
  }
  return { data: migrate(parsed, fresh), writable: true };
}

export interface SaveWriter {
  /** Marks the save dirty; it is written at most SAVE.writeDelayMs later. */
  schedule(): void;
  /** Writes pending changes now and resolves once every write so far has landed. */
  flush(): Promise<void>;
}

/**
 * Batches writes instead of resetting a debounce on every change: games add coins many
 * times a second during a match, and a resetting debounce would keep postponing the
 * write until the match ended (or the app was killed).
 */
export function createSaveWriter(storage: StorageAdapter, serialize: () => SaveData): SaveWriter {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  // Writes are chained so an older snapshot can never land after a newer one.
  let written: Promise<void> = Promise.resolve();

  const write = (): Promise<void> => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    dirty = false;
    const json = JSON.stringify(serialize());
    written = written
      .then(() => storage.save(SAVE.key, json))
      .catch((err: unknown) => console.warn('[meta] save failed', err));
    return written;
  };

  return {
    schedule() {
      dirty = true;
      timer ??= setTimeout(write, SAVE.writeDelayMs);
    },
    flush() {
      return dirty ? write() : written;
    },
  };
}
