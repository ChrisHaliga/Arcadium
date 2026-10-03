/**
 * Landgrab tuning. Every gameplay and economy number lives here so balancing
 * never means hunting through systems.
 */
import type { SimConfig } from './core/types';

export const GAME_ID = 'landgrab';
export const GAME_TITLE = 'Landgrab';

export const SIM_CONFIG: SimConfig = {
  size: 480,
  winPermille: 980,
  ticksPerSecond: 20,
  // ~22 cells/s; crossing the map takes ~18 s.
  speed: 280,
  // ~14 degrees per tick: a turning circle ~9 cells across, tight but never instant.
  turnRate: 40,
  headRadius: 3,
  trailRadius: 2,
  selfGraceTicks: 10,
  startRadius: 14,
  clutchRadius: 10,
  closeCallRadius: 10,
  multiKillTicks: 60,
  // A capture of 5% of the map is a big haul; taking 0.5% of the map from the leader is a leader steal.
  bigHaulPermille: 50,
  leaderStealPermille: 5,
  treasureCount: 6,
  treasureRespawnTicks: 160,
  reviveWindowTicks: 100,
  maxRevivesPerRound: 2,
  maxSlots: 16,
};

export const ROOM = {
  /** Humans + bots never exceed this. */
  capacity: 16,
  /** Bots are added until humans + bots reaches this. */
  minPopulation: 10,
  /** Ticks between a round ending and the next map starting (results screen time). */
  roundEndTicks: 160,
  /** Dead bots come back after this many ticks, give or take botRespawnSpread of it. */
  botRespawnTicks: 60,
  /** 0.5 = each bot's wait is randomised +-50%, so bots killed together don't all return together. */
  botRespawnSpread: 0.5,
  /** Server only: rooms with no humans for this long are shut down. */
  emptyRoomTimeoutMs: 15_000,
};

export const NET = {
  protocolVersion: 2,
  /**
   * Server sends a state checksum every N ticks for desync detection. A checksum costs about
   * as much as a room tick, so every 2 s keeps it to a few percent of a room's CPU.
   */
  checksumEvery: 40,
  /** Max client prediction ahead of confirmed state, in ticks. */
  maxPredictTicks: 4,
  /** Client messages per second before the server starts dropping them. */
  maxClientMsgsPerSecond: 40,
  defaultServers: ['ws://localhost:8787/play'],
};

/** Coins: every number the player can earn or spend inside Landgrab. */
export const REWARDS = {
  /** Captured cells per coin (the raster is fine-grained: 5% of the map is ~8,000 cells). */
  cellsPerCoin: 10,
  kill: 150,
  treasure: 250,
  win: 5000,
  /** Base payout of a feat before its multiplier roll. */
  featBase: 100,
  /** Weighted multiplier roll for feats: [multiplier, weight]. */
  featMultipliers: [
    [2, 50],
    [3, 25],
    [5, 15],
    [10, 10],
  ] as const,
  /** A capture within this many ticks of the previous one extends the combo. */
  comboWindowTicks: 80,
  /** Capture coins x (1 + comboStep * combo), capped. */
  comboStep: 0.25,
  comboMaxMultiplier: 3,
  /** First time per life your share crosses each threshold (percent -> bonus). */
  milestones: [
    [10, 100],
    [25, 300],
    [50, 800],
    [75, 2000],
  ] as const,
  /** Revive price for the 1st, 2nd... revive in a round. */
  reviveCosts: [300, 800] as const,
  /** End-of-life reel spins: one per feat, capped. */
  maxSpins: 3,
  /** Weighted reel results: [multiplier, weight]. Best spin counts. */
  reelMultipliers: [
    [1, 40],
    [2, 30],
    [3, 16],
    [5, 10],
    [10, 4],
  ] as const,
  /** XP granted per coin earned in a match. */
  xpPerCoin: 0.1,
};
