/**
 * Daily reward calendar with streaks and streak freezes.
 *
 * Missed days are settled at the day's rollover rather than at claim time, so the hub
 * can tell the player "a freeze saved your streak" or "streak lost" as soon as they
 * open the app, before they claim anything.
 */
import { batch, computed, type ReadonlySignal, type Signal } from '@preact/signals';
import type { WalletService } from '../shared/services';
import { DAILY, type ChestType } from './config';
import type { MetaChests } from './chests';
import type { DailyData } from './save';
import type { StatsRecorder } from './stats';
import { addDays, dayEnd, daysBetween, type Clock } from './time';

export interface DailyReward {
  /** Calendar day 1..7. */
  day: number;
  coins: number;
  /** A chest added to the held stock (open it with chests.openFree). */
  chest: ChestType | null;
}

export interface DailyState {
  /** Calendar day to highlight: the one claimable now, or the one already claimed today. */
  day: number;
  claimable: boolean;
  /** Claims in the current streak (today's included once claimed). */
  streak: number;
  freezes: number;
  /** Local midnight when the next reward unlocks (epoch ms). */
  nextResetAt: number;
  /** Freezes spent at today's rollover to bridge missed days (0 when none were needed). */
  freezesUsedToday: number;
  /** Length of the streak lost today because missed days could not be bridged (0 when none). */
  streakLostToday: number;
}

export interface DailyRewards {
  /** The 7-day calendar, for rendering every tile. */
  readonly calendar: readonly DailyReward[];
  readonly state: ReadonlySignal<DailyState>;
  readonly freezePrice: number;
  readonly maxFreezes: number;
  /** Grants today's reward; null when it was already claimed today. */
  claim(): DailyReward | null;
  /**
   * Buys a streak freeze; false when already holding the maximum or coins are short.
   * Each missed day uses one freeze; a gap longer than the freezes held resets the
   * streak to day 1 and keeps the freezes.
   */
  buyFreeze(): boolean;
}

const calendar: readonly DailyReward[] = DAILY.rewards.map((reward, i) => ({ day: i + 1, ...reward }));

const nextCycleDay = (cycleDay: number): number => (cycleDay % calendar.length) + 1;

/** A clock turned back before the last claim never unlocks another claim. */
const canClaim = (daily: DailyData, today: string): boolean =>
  daily.lastClaim === null || daysBetween(daily.lastClaim, today) > 0;

export function createDaily(
  daily: Signal<DailyData>,
  clock: Clock,
  wallet: WalletService,
  chests: MetaChests,
  stats: StatsRecorder,
): DailyRewards {
  const rollover = () => {
    const d = daily.value;
    const today = clock.day.value;
    if (d.coveredThrough === null) return;
    const missed = daysBetween(d.coveredThrough, today) - 1;
    if (missed <= 0) return;
    if (d.freezes >= missed) {
      daily.value = {
        ...d,
        freezes: d.freezes - missed,
        coveredThrough: addDays(today, -1),
        lastRollover: { day: today, freezesUsed: missed, streakLost: 0 },
      };
    } else {
      daily.value = {
        ...d,
        coveredThrough: null,
        cycleDay: 0,
        streak: 0,
        lastRollover: { day: today, freezesUsed: 0, streakLost: d.streak },
      };
    }
  };
  rollover();
  clock.onRollover(rollover);

  const state = computed((): DailyState => {
    const d = daily.value;
    const today = clock.day.value;
    const claimable = canClaim(d, today);
    const note = d.lastRollover?.day === today ? d.lastRollover : null;
    return {
      day: claimable ? nextCycleDay(d.cycleDay) : d.cycleDay,
      claimable,
      streak: d.streak,
      freezes: d.freezes,
      nextResetAt: dayEnd(today),
      freezesUsedToday: note?.freezesUsed ?? 0,
      streakLostToday: note?.streakLost ?? 0,
    };
  });

  return {
    calendar,
    state,
    freezePrice: DAILY.freezePrice,
    maxFreezes: DAILY.maxFreezes,
    claim() {
      clock.sync();
      const d = daily.value;
      const today = clock.day.value;
      if (!canClaim(d, today)) return null;
      const reward = calendar[nextCycleDay(d.cycleDay) - 1];
      batch(() => {
        daily.value = { ...d, lastClaim: today, coveredThrough: today, cycleDay: reward.day, streak: d.streak + 1 };
        if (reward.coins > 0) wallet.add(reward.coins, 'daily');
        if (reward.chest) chests.give(reward.chest);
        stats.add('dailyClaims', 1);
        stats.best('bestStreak', d.streak + 1);
      });
      return reward;
    },
    buyFreeze() {
      clock.sync();
      const d = daily.value;
      if (d.freezes >= DAILY.maxFreezes) return false;
      return batch(() => {
        if (!wallet.spend(DAILY.freezePrice, 'streak-freeze')) return false;
        daily.value = { ...d, freezes: d.freezes + 1 };
        return true;
      });
    },
  };
}
