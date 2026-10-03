/**
 * The hub's economy and progression layer, shared by every game in the bundle.
 *
 * createMeta() loads the save, builds the services games receive (wallet, progress,
 * profile, cosmetics, settings) plus the hub-only features (daily rewards, missions,
 * shop, chests, celebration queues), and persists every change automatically.
 *
 * Time: daily content follows the local calendar. Actions always settle the date first,
 * but views only roll over when something calls refresh(): the hub should call it on a
 * timer (its countdowns already tick every second) and when the app resumes.
 * Persistence: writes are batched (~500 ms); call flush() when the app is backgrounded.
 */
import { batch, effect, untracked, type ReadonlySignal } from '@preact/signals';
import type { GameModule } from '../shared/game';
import type {
  CosmeticsService,
  ProfileService,
  ProgressService,
  SettingsService,
  StorageAdapter,
  WalletService,
} from '../shared/services';
import { QUEUES } from './config';
import { createChests, type Chests } from './chests';
import { createCosmetics } from './cosmetics';
import { createDaily, type DailyRewards } from './daily';
import { createMissions, type Missions } from './missions';
import { createProfile } from './profile';
import { createProgress, type LevelUp } from './progress';
import { createQueue, type EventQueue } from './queue';
import { createSaveWriter, loadSave, type LifetimeStats } from './save';
import { createSettings } from './settings';
import { createShop, type Shop } from './shop';
import { createState, snapshot } from './state';
import { createStats } from './stats';
import { createClock } from './time';
import { createWallet, type CoinGain } from './wallet';

export type { ChestType } from './config';
export type { ChestInfo, ChestResult, Chests } from './chests';
export type { DailyReward, DailyRewards, DailyState } from './daily';
export type { ActiveMission, Missions } from './missions';
export type { LevelInfo, LevelUp } from './progress';
export type { EventQueue } from './queue';
export type { LifetimeStats } from './save';
export type { ShopItem, Shop } from './shop';
export type { CoinGain } from './wallet';
export { levelInfo } from './progress';

export interface MetaOptions {
  storage: StorageAdapter;
  /** Every game in the bundle; cosmetics, missions and starting loadouts come from them. */
  games: readonly GameModule[];
  /** Clock (epoch ms); inject a fake one to simulate days passing. */
  now?: () => number;
  /** Source for chest rolls, rerolls and the starting name/colour; seeded draws don't use it. */
  random?: () => number;
}

/** What games receive through GameServices (the hub adds audio, haptics and exit). */
export interface MetaServices {
  wallet: WalletService;
  progress: ProgressService;
  profile: ProfileService;
  cosmetics: CosmeticsService;
  settings: SettingsService;
}

export interface Meta {
  services: MetaServices;
  daily: DailyRewards;
  missions: Missions;
  shop: Shop;
  chests: Chests;
  /** Level-ups waiting to be celebrated; rewards are already granted when they're queued. */
  levelUps: EventQueue<LevelUp>;
  /** Recent coin gains for the fly-into-the-counter animation (most recent QUEUES.coinGains kept). */
  coinGains: EventQueue<CoinGain>;
  stats: ReadonlySignal<LifetimeStats>;
  /** Re-reads the clock and rolls daily/weekly content over if a local day or week boundary passed. */
  refresh(): void;
  /** Writes pending changes now; resolves when they are stored. */
  flush(): Promise<void>;
}

export async function createMeta(options: MetaOptions): Promise<Meta> {
  const { storage, games } = options;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  const loaded = await loadSave(storage, { now, random });
  const state = createState(loaded.data);
  const clock = createClock(now);
  const levelUps = createQueue<LevelUp>(QUEUES.levelUps);
  const coinGains = createQueue<CoinGain>(QUEUES.coinGains);
  // Untracked so a flush() called from inside a component or effect doesn't subscribe it to the whole save.
  const writer = loaded.writable ? createSaveWriter(storage, () => untracked(() => snapshot(state))) : null;

  // Startup repairs and rollovers below write to the state; batch them into one update.
  const meta = batch((): Meta => {
    const stats = createStats(state.stats);
    const wallet = createWallet(state.coins, stats, coinGains, now);
    const cosmetics = createCosmetics(state.owned, games);
    const chests = createChests(state.chests, wallet, cosmetics, stats, random);
    const missions = createMissions(state.missions, games, clock, wallet, stats, random);
    const progress = createProgress(state.totalXp, wallet, chests, levelUps, (gameId, stat, value, mode) =>
      batch(() => {
        missions.record(gameId, stat, value, mode);
        if (mode === 'add') stats.addGame(gameId, stat, value);
      }),
    );
    return {
      services: {
        wallet,
        progress,
        profile: createProfile(state.profile, state.playerId, cosmetics, games),
        cosmetics,
        settings: createSettings(state.settings),
      },
      daily: createDaily(state.daily, clock, wallet, chests, stats),
      missions,
      shop: createShop(state.shop, clock, wallet, cosmetics, stats),
      chests,
      levelUps,
      coinGains,
      stats: stats.value,
      refresh: clock.sync,
      flush: () => writer?.flush() ?? Promise.resolve(),
    };
  });

  if (writer) {
    // Subscribes to every slice; the first run also persists a new or repaired save.
    effect(() => {
      snapshot(state);
      writer.schedule();
    });
  }
  return meta;
}
