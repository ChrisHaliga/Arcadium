/**
 * Copies what the HUD shows out of the drawn state once per tick: your share and rank,
 * and the top five (plus your own row when you're further down). Signals are only
 * written when something visible changed, so the overlays don't re-render for nothing.
 */
import { leaderboard, permille, type SimState, type Slot } from '../core';
import { playerColor } from '../palette';
import type { GameUi, LeaderRow, ScoreView } from '../ui/store';

const TOP_ROWS = 5;

export class HudSync {
  private scoreKey = '';
  private leadersKey = '';

  constructor(
    private readonly ui: GameUi,
    private readonly slot: Slot,
  ) {}

  update(view: SimState): void {
    const rows = leaderboard(view);
    const myIndex = rows.findIndex((row) => row.slot === this.slot);
    const me = view.players[this.slot];
    const colors = me ? playerColor(me.profile.kind, me.profile.color) : null;
    const score: ScoreView = {
      // Land kept through a second-chance window still counts, so it stays on the card while down.
      permille: permille(view, this.slot),
      rank: myIndex + 1,
      players: rows.length,
      color: colors?.base ?? this.ui.score.peek().color,
      edge: colors?.dark ?? this.ui.score.peek().edge,
    };
    const scoreKey = `${score.permille}|${score.rank}|${score.players}|${score.color}`;
    if (scoreKey !== this.scoreKey) {
      this.scoreKey = scoreKey;
      this.ui.score.value = score;
    }

    const shown = rows.slice(0, TOP_ROWS).map((row, i) => this.row(view, row.slot, i + 1));
    if (myIndex >= TOP_ROWS) shown.push(this.row(view, this.slot, myIndex + 1));
    const leadersKey = shown.map((r) => `${r.slot}:${r.permille}:${r.name}`).join('|');
    if (leadersKey !== this.leadersKey) {
      this.leadersKey = leadersKey;
      this.ui.leaders.value = shown;
    }
  }

  private row(view: SimState, slot: Slot, rank: number): LeaderRow {
    const p = view.players[slot]!;
    const colors = playerColor(p.profile.kind, p.profile.color);
    return {
      slot,
      rank,
      name: p.profile.name,
      permille: permille(view, slot),
      color: colors.base,
      edge: colors.dark,
      me: slot === this.slot,
    };
  }
}
