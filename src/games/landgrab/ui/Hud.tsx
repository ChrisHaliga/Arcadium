/**
 * The in-match heads-up display: your share of the map and rank, this life's coins,
 * the live top five, the minimap, the combo meter, kill feed lines and the bubble that
 * shows what the current loop is worth.
 */
import type { JSX } from 'preact';
import { CoinIcon, Icon } from '../../../shared/ui/kit';
import { formatNumber, formatPermille, useBump, useRolling } from './hooks';
import type { GameUi, LifeView, ScoreView } from './store';
import './hud.css';

export function Hud({ ui }: { ui: GameUi }): JSX.Element {
  const life = ui.life.value;
  const playing = life === 'alive' || life === 'down';
  return (
    <div class={`lg-hud${playing ? '' : ' lg-hud--idle'}`}>
      <div class="lg-hud__left">
        <div class="lg-hud__row">
          {/* Out of the focus order: keys and pads pause with Escape and Start, and focus left here would catch Space. */}
          <button type="button" class="lg-pause" aria-label="Pause" tabIndex={-1} onClick={() => ui.actions.pause()}>
            <Icon name="pause" />
          </button>
          <ScoreCard ui={ui} />
        </div>
        <div class="lg-hud__row">
          <CoinCounter ui={ui} />
          <ComboMeter ui={ui} />
        </div>
        <KillFeed ui={ui} />
      </div>
      <Leaderboard ui={ui} />
      <Minimap ui={ui} />
      <PendingBubble ui={ui} />
    </div>
  );
}

function ScoreCard({ ui }: { ui: GameUi }): JSX.Element {
  const score = ui.score.value;
  const shown = useRolling(score.permille, 250, 700);
  const bump = useBump(Math.floor(score.permille / 10));
  return (
    <div class={`lg-score${bump ? ' is-bumping' : ''}`} style={{ '--me': score.color, '--me-edge': score.edge }}>
      <span class="lg-score__value">{formatPermille(shown)}</span>
      <span class="lg-score__rank">{rankLabel(score, ui.life.value)}</span>
    </div>
  );
}

function rankLabel(score: ScoreView, life: LifeView): string {
  if (score.rank > 0) return `#${score.rank} of ${score.players}`;
  return life === 'down' ? 'Down!' : 'Out';
}

function CoinCounter({ ui }: { ui: GameUi }): JSX.Element {
  const coins = ui.coins.value;
  const shown = useRolling(coins, 300, 1000, 'snap');
  const bump = useBump(coins);
  return (
    <div
      class={`lg-coins${bump ? ' is-bumping' : ''}`}
      ref={(el) => {
        ui.coinCounter = el;
      }}
    >
      <CoinIcon />
      <span class="lg-coins__value">{formatNumber(shown)}</span>
    </div>
  );
}

function KillFeed({ ui }: { ui: GameUi }): JSX.Element {
  return (
    <ul class="lg-feed" aria-live="polite">
      {ui.feed.value.map((line) => (
        <li key={line.id} class="lg-feed__line">
          <Icon name="sword" class="lg-feed__icon" />
          <span class="lg-feed__text">{line.text}</span>
          <span class="lg-feed__coins">+{formatNumber(line.coins)}</span>
        </li>
      ))}
    </ul>
  );
}

function Leaderboard({ ui }: { ui: GameUi }): JSX.Element {
  const rows = ui.leaders.value;
  const top = rows.reduce((max, row) => Math.max(max, row.permille), 1);
  return (
    <ol class="lg-board" aria-label="Leaderboard">
      {rows.map((row) => (
        <li
          key={row.slot}
          class={`lg-board__row${row.me ? ' lg-board__row--me' : ''}`}
          style={{
            '--row': row.color,
            '--row-edge': row.edge,
            '--fill': `${(0.62 + 0.38 * (row.permille / top)) * 100}%`,
          }}
        >
          <span class="lg-board__rank">{row.rank}</span>
          <span class="lg-board__name">{row.name}</span>
          <span class="lg-board__pct">{formatPermille(row.permille)}</span>
        </li>
      ))}
    </ol>
  );
}

function ComboMeter({ ui }: { ui: GameUi }): JSX.Element | null {
  const combo = ui.combo.value;
  if (combo.level < 1) return null;
  return (
    <div class="lg-combo" key={combo.level}>
      <span class="lg-combo__label">Combo</span>
      <span class="lg-combo__value">×{Number(combo.multiplier.toFixed(2))}</span>
      <span class="lg-combo__track">
        <span class="lg-combo__fill" style={{ width: `${Math.max(0, combo.left) * 100}%` }} />
      </span>
    </div>
  );
}

function Minimap({ ui }: { ui: GameUi }): JSX.Element {
  return (
    <div class="lg-minimap">
      <canvas
        class="lg-minimap__canvas"
        ref={(el) => {
          ui.minimap = el;
        }}
      />
    </div>
  );
}

/** Positioned over the player's head by the frame loop; this only fills in the value. */
function PendingBubble({ ui }: { ui: GameUi }): JSX.Element {
  const coins = ui.pending.value;
  const shown = useRolling(coins, 120, 300);
  return (
    <div
      class={`lg-pending${coins > 0 ? ' is-on' : ''}`}
      ref={(el) => {
        ui.pendingBubble = el;
      }}
      aria-hidden="true"
    >
      <span class="lg-pending__body">
        <CoinIcon />+{formatNumber(shown)}
      </span>
    </div>
  );
}
