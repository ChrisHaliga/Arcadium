/**
 * Turns this player's confirmed simulation events into coins: captures (with combos),
 * kills, feats (with a rolled multiplier), treasures, milestones and the win bonus. It
 * keeps the running tally of the current life and produces the moments the UI
 * celebrates. Pure logic: no DOM, no clocks; randomness comes from the injected Rng and
 * only ever follows something the player did.
 */
import { REWARDS } from '../config';
import { leaderboard, permille } from '../core';
import type { DeathCause, FeatId, SimEvent, SimState, Slot } from '../core/types';
import { nearMissLine, type Standing } from './nearMiss';
import { tableValues, weightedPick, type Rng } from './random';
import { bestMultiplier, rollSpins } from './reels';
import type { EarningLine, HapticStrength, LifeEnding, LifeResult, LifeSummary, MomentSound, RewardMoment } from './types';

/** A capture of at least this share of the map sounds and feels big. */
const BIG_CAPTURE_PERMILLE = 20;
const MEDIUM_CAPTURE_PERMILLE = 8;
/** Bigger captures sound deeper: from the first pitch for a sliver down to the second at HUGE_CAPTURE_PERMILLE and beyond. */
const CAPTURE_PITCH_RANGE = [1.15, 0.8] as const;
const HUGE_CAPTURE_PERMILLE = 80;
/** Each combo step raises the capture sound by this much on top. */
const COMBO_PITCH_STEP = 0.07;
const MAX_COMBO_BOOST = 1.6;

/** Feat names, as called out in the match and on the bonus spins they earn. */
export const FEAT_TITLES: Readonly<Record<FeatId, string>> = {
  trap: 'Trapped!',
  clutch: 'Clutch Cut!',
  multikill: 'Multi-Kill!',
  bighaul: 'Big Haul!',
  leadersteal: 'Leader Steal!',
  revenge: 'Revenge!',
  closecall: 'Close Call!',
};

const FEAT_FACES = tableValues(REWARDS.featMultipliers);

export interface ComboState {
  /** Captures chained after the first (0 = no combo running). */
  level: number;
  multiplier: number;
  /** Share of the combo window left, 1 right after a capture down to 0. */
  left: number;
}

export class LifeRewards {
  private summary: LifeSummary = emptySummary(0);
  private active = false;
  private combo = 0;
  private lastCaptureTick = -1;
  private standing: Standing | null = null;

  constructor(
    private readonly slot: Slot,
    private readonly rng: Rng,
  ) {}

  /** A life is being tallied. */
  get inLife(): boolean {
    return this.active;
  }

  /** Coins this life has earned so far, after any second chance it paid for. */
  get earnings(): number {
    return Math.max(0, earningsOf(this.summary));
  }

  /** Starts tallying a fresh life (not a revive, which continues the current one). */
  begin(state: SimState): void {
    this.summary = emptySummary(state.tick);
    this.active = true;
    this.combo = 0;
    this.lastCaptureTick = -1;
    this.standing = null;
  }

  /** Feeds one confirmed event; returns what to celebrate. */
  onEvent(e: SimEvent, state: SimState): RewardMoment[] {
    if (!this.active) return [];
    switch (e.t) {
      case 'capture':
        return e.slot === this.slot ? [this.capture(e.cells, state)] : [];
      case 'death':
        return e.killer === this.slot && e.slot !== this.slot ? [this.kill(e.slot, e.cause, e.at, state)] : [];
      case 'feat':
        return e.slot === this.slot ? [this.feat(e.feat, e.victim, state)] : [];
      case 'treasure':
        return e.slot === this.slot ? [this.treasure(e.cell)] : [];
      case 'roundOver':
        return e.winner === this.slot ? [this.win()] : [];
      case 'spawn':
        if (e.slot === this.slot && e.revive) this.summary.revives++;
        return [];
      default:
        return [];
    }
  }

  /** After each confirmed tick: peak share, standing for the near-miss line, milestones. */
  onTick(state: SimState): RewardMoment[] {
    const me = state.players[this.slot];
    if (!this.active || !me?.alive) return [];
    const share = permille(state, this.slot);
    this.summary.peakPermille = Math.max(this.summary.peakPermille, share);
    this.standing = standingOf(state, this.slot, share);
    const moments: RewardMoment[] = [];
    for (const [percent, bonus] of REWARDS.milestones) {
      if (share < percent * 10 || this.summary.milestones.includes(percent)) continue;
      this.summary.milestones.push(percent);
      this.summary.milestoneCoins += bonus;
      moments.push(
        moment('milestone', `${percent}% of the map!`, 'Milestone bonus', bonus, [], [{ id: 'milestone', pitch: 1 }], 'heavy'),
      );
    }
    return moments;
  }

  comboAt(tick: number): ComboState {
    if (!this.withinComboWindow(tick)) return { level: 0, multiplier: 1, left: 0 };
    return {
      level: this.combo,
      multiplier: comboMultiplier(this.combo),
      left: 1 - (tick - this.lastCaptureTick) / REWARDS.comboWindowTicks,
    };
  }

  /** What closing a loop of `cells` would pay on `tick`, combo included. */
  loopValue(cells: number, tick: number): number {
    if (cells <= 0) return 0;
    const combo = this.withinComboWindow(tick) ? this.combo + 1 : 0;
    return captureCoins(cells, combo);
  }

  /** Part of a second chance's price is paid out of this life's earnings. */
  payFromRun(amount: number): void {
    this.summary.revivePaidFromRun += amount;
  }

  /** The host refused the revive: give back what the run paid. */
  refundRun(amount: number): void {
    this.summary.revivePaidFromRun = Math.max(0, this.summary.revivePaidFromRun - amount);
  }

  /**
   * Closes the life and settles it: earnings by category, bonus spins (one per feat,
   * not for a life that was left), the best multiplier, XP and the near-miss line.
   */
  finish(state: SimState, ending: LifeEnding): LifeResult {
    const summary = this.summary;
    this.active = false;
    const lines = earningLines(summary);
    const subtotal = Math.max(
      0,
      lines.reduce((sum, line) => sum + line.coins, 0),
    );
    const spins = ending.kind === 'left' ? [] : rollSpins(summary.feats.map((award) => award.feat), this.rng);
    const multiplier = bestMultiplier(spins);
    const total = Math.round(subtotal * multiplier);
    const won = ending.kind === 'roundOver' && ending.won;
    return {
      ending,
      summary,
      lines,
      subtotal,
      spins,
      multiplier,
      total,
      xp: Math.round(total * REWARDS.xpPerCoin),
      nearMiss: won || ending.kind === 'left' ? null : nearMissLine(this.standing, summary.peakPermille),
      seconds: secondsAlive(state, this.slot, summary.startTick),
    };
  }

  private withinComboWindow(tick: number): boolean {
    return this.lastCaptureTick >= 0 && tick - this.lastCaptureTick <= REWARDS.comboWindowTicks;
  }

  private capture(cells: readonly number[], state: SimState): RewardMoment {
    this.combo = this.withinComboWindow(state.tick) ? this.combo + 1 : 0;
    this.lastCaptureTick = state.tick;
    const coins = captureCoins(cells.length, this.combo);
    const s = this.summary;
    s.captures++;
    s.captureCoins += coins;
    s.bestCombo = Math.max(s.bestCombo, this.combo);
    if (state.playable > 0) s.capturedPermille += (cells.length * 1000) / state.playable;

    const share = state.playable > 0 ? (cells.length * 1000) / state.playable : 0;
    const boost = Math.min(MAX_COMBO_BOOST, 1 + this.combo * COMBO_PITCH_STEP);
    const sounds: MomentSound[] = [
      { id: share >= BIG_CAPTURE_PERMILLE ? 'bigCapture' : 'capture', pitch: sizePitch(share) * boost },
    ];
    if (this.combo > 0) sounds.push({ id: 'combo', pitch: boost });
    const haptic: HapticStrength =
      share >= BIG_CAPTURE_PERMILLE ? 'heavy' : share >= MEDIUM_CAPTURE_PERMILLE ? 'medium' : 'light';
    return moment('capture', '', '', coins, cells, sounds, haptic);
  }

  private kill(victim: Slot, cause: DeathCause, at: number, state: SimState): RewardMoment {
    this.summary.kills++;
    this.summary.killCoins += REWARDS.kill;
    const name = nameOf(state, victim);
    return {
      ...moment('kill', '', name, REWARDS.kill, [at], [{ id: 'kill', pitch: 1 }], 'heavy'),
      feed: killLine(cause, name),
    };
  }

  private feat(feat: FeatId, victim: Slot, state: SimState): RewardMoment {
    const multiplier = weightedPick(REWARDS.featMultipliers, this.rng);
    const coins = REWARDS.featBase * multiplier;
    this.summary.feats.push({ feat, multiplier, coins });
    this.summary.featCoins += coins;
    const sound: MomentSound = {
      id: feat === 'closecall' ? 'closeCall' : 'feat',
      pitch: 1,
    };
    return {
      ...moment(
        'feat',
        FEAT_TITLES[feat],
        featDetail(feat, victim === 0 ? '' : nameOf(state, victim)),
        coins,
        [],
        [sound],
        'medium',
      ),
      roll: { multiplier, faces: FEAT_FACES },
    };
  }

  private treasure(cell: number): RewardMoment {
    this.summary.treasures++;
    this.summary.treasureCoins += REWARDS.treasure;
    return moment('treasure', 'Treasure!', 'Bonus coins', REWARDS.treasure, [cell], [{ id: 'treasure', pitch: 1 }], 'medium');
  }

  private win(): RewardMoment {
    this.summary.won = true;
    this.summary.winCoins += REWARDS.win;
    return moment('win', 'You win!', 'Round winner bonus', REWARDS.win, [], [{ id: 'win', pitch: 1 }], 'heavy');
  }
}

function comboMultiplier(combo: number): number {
  return Math.min(REWARDS.comboMaxMultiplier, 1 + REWARDS.comboStep * combo);
}

function sizePitch(sharePermille: number): number {
  const [small, huge] = CAPTURE_PITCH_RANGE;
  const t = Math.min(1, Math.log1p(sharePermille) / Math.log1p(HUGE_CAPTURE_PERMILLE));
  return small + (huge - small) * t;
}

function captureCoins(cells: number, combo: number): number {
  return Math.max(1, Math.round((cells / REWARDS.cellsPerCoin) * comboMultiplier(combo)));
}

function earningsOf(s: LifeSummary): number {
  return s.captureCoins + s.killCoins + s.featCoins + s.treasureCoins + s.milestoneCoins + s.winCoins - s.revivePaidFromRun;
}

function earningLines(s: LifeSummary): EarningLine[] {
  const lines: EarningLine[] = [
    {
      id: 'land',
      label: 'Land captured',
      count: s.captures,
      coins: s.captureCoins,
    },
    { id: 'kills', label: 'Knockouts', count: s.kills, coins: s.killCoins },
    { id: 'feats', label: 'Feats', count: s.feats.length, coins: s.featCoins },
    {
      id: 'treasures',
      label: 'Treasure',
      count: s.treasures,
      coins: s.treasureCoins,
    },
    {
      id: 'milestones',
      label: 'Milestones',
      count: s.milestones.length,
      coins: s.milestoneCoins,
    },
    { id: 'win', label: 'Round win', count: 0, coins: s.winCoins },
    {
      id: 'revive',
      label: 'Second chance',
      count: 0,
      coins: -s.revivePaidFromRun,
    },
  ];
  return lines.filter((line) => line.coins !== 0);
}

function standingOf(state: SimState, slot: Slot, share: number): Standing {
  const rows = leaderboard(state);
  const index = rows.findIndex((row) => row.slot === slot);
  const above = index > 0 ? rows[index - 1] : null;
  return {
    rank: index + 1,
    permille: share,
    abovePermille: above ? permille(state, above.slot) : null,
  };
}

function nameOf(state: SimState, slot: Slot): string {
  return state.players[slot]?.profile.name ?? 'someone';
}

function killLine(cause: DeathCause, victim: string): string {
  switch (cause) {
    case 'enclosed':
      return `You trapped ${victim}`;
    case 'landlost':
      return `You took all of ${victim}'s land`;
    default:
      return `You cut ${victim}`;
  }
}

function featDetail(feat: FeatId, victim: string): string {
  switch (feat) {
    case 'trap':
      return `Enclosed ${victim}`;
    case 'clutch':
      return `Cut ${victim} at their door`;
    case 'multikill':
      return 'Kills back to back';
    case 'bighaul':
      return 'Huge capture';
    case 'leadersteal':
      return victim ? `Land from leader ${victim}` : 'Land from the leader';
    case 'revenge':
      return `Got back at ${victim}`;
    case 'closecall':
      return victim ? `${victim} was right there` : 'That was close';
  }
}

function moment(
  kind: RewardMoment['kind'],
  title: string,
  detail: string,
  coins: number,
  from: readonly number[],
  sounds: readonly MomentSound[],
  haptic: HapticStrength,
): RewardMoment {
  return {
    kind,
    title,
    detail,
    coins,
    from,
    sounds,
    haptic,
    roll: null,
    feed: null,
  };
}

function emptySummary(startTick: number): LifeSummary {
  return {
    startTick,
    captures: 0,
    captureCoins: 0,
    bestCombo: 0,
    kills: 0,
    killCoins: 0,
    feats: [],
    featCoins: 0,
    treasures: 0,
    treasureCoins: 0,
    milestones: [],
    milestoneCoins: 0,
    won: false,
    winCoins: 0,
    revives: 0,
    revivePaidFromRun: 0,
    peakPermille: 0,
    capturedPermille: 0,
  };
}

/** How long the life lasted: from spawn to the death, not counting a second chance left to run out, or to now. */
function secondsAlive(state: SimState, slot: Slot, startTick: number): number {
  const p = state.players[slot];
  const end = p && !p.alive && p.diedAtTick >= startTick ? p.diedAtTick : state.tick;
  return Math.max(0, Math.round((end - startTick) / state.config.ticksPerSecond));
}
