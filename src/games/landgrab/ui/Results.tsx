/**
 * End of life: earnings count up by category, one bonus spin per feat, the best spin
 * multiplies the total, and the total flies into the wallet while the XP bar fills.
 * The coins are already banked when this opens (so leaving early never loses them);
 * the screen is the celebration. Tapping the panel skips straight to the end.
 *
 * Play Again stays in view at every screen size: on narrow screens the summary above it
 * scrolls if it must, on wide ones the summary and the rewards sit side by side.
 */
import type { JSX, RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EarningId, EarningLine, LifeResult } from '../rewards';
import { Button, CoinIcon, Icon, type IconName } from '../../../shared/ui/kit';
import { formatDuration, formatNumber, formatPermille, useMatchClock, useRolling } from './hooks';
import { BonusSpin, SPIN_REVEAL_MS } from './BonusSpin';
import type { GameUi, ResultsView } from './store';
import { endingDetail, endingTitle } from './text';
import { XpBar } from './XpBar';
import './results.css';

type Beat =
  | { kind: 'intro' }
  | { kind: 'line'; index: number }
  | { kind: 'subtotal' }
  | { kind: 'spin'; index: number }
  | { kind: 'multiply' }
  | { kind: 'bank' }
  | { kind: 'done' };

const BEAT_MS: Record<Beat['kind'], number> = {
  intro: 500,
  line: 480,
  subtotal: 450,
  spin: SPIN_REVEAL_MS + 650,
  multiply: 900,
  bank: 900,
  done: 0,
};

/** Coins drawn flying into the wallet. */
const FLYING_COINS = 12;
const COIN_FLIGHT_MS = 650;

const LINE_ICONS: Record<EarningId, IconName> = {
  land: 'land',
  kills: 'sword',
  feats: 'star',
  treasures: 'gem',
  milestones: 'flag',
  win: 'trophy',
  revive: 'heart',
};

function beatsFor(result: LifeResult): Beat[] {
  const beats: Beat[] = [{ kind: 'intro' }];
  result.lines.forEach((_, index) => beats.push({ kind: 'line', index }));
  beats.push({ kind: 'subtotal' });
  result.spins.forEach((_, index) => beats.push({ kind: 'spin', index }));
  if (result.multiplier > 1) beats.push({ kind: 'multiply' });
  beats.push({ kind: 'bank' }, { kind: 'done' });
  return beats;
}

export function Results({ ui, view }: { ui: GameUi; view: ResultsView }): JSX.Element {
  const { result } = view;
  const beats = useMemo(() => beatsFor(result), [result]);
  const [at, setAt] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const beat = beats[at];
  const beatIndex = (kind: Beat['kind'], index = 0) =>
    beats.findIndex((b) => b.kind === kind && (!('index' in b) || b.index === index));
  const reached = (kind: Beat['kind'], index = 0) => {
    const i = beatIndex(kind, index);
    return i >= 0 && i <= at;
  };
  const passed = (kind: Beat['kind'], index = 0) => {
    const i = beatIndex(kind, index);
    return i >= 0 && i < at;
  };

  useEffect(() => {
    if (beat.kind === 'done') return;
    if (!skipped) playBeat(ui, beat, result);
    const timer = setTimeout(() => setAt(at + 1), skipped ? 0 : BEAT_MS[beat.kind]);
    return () => clearTimeout(timer);
  }, [at, skipped]);

  const skip = () => {
    if (beat.kind === 'done' || skipped) return;
    setSkipped(true);
    // Straight to the bank, so the coins still visibly land in the wallet.
    setAt(Math.max(at, beatIndex('bank')));
  };

  const linesShown = result.lines.filter((_, i) => reached('line', i));
  const runningTotal = linesShown.reduce((sum, line) => sum + line.coins, 0);
  const multiplied = reached('multiply');
  const shownTotal = multiplied || reached('bank') ? result.total : Math.max(0, runningTotal);
  const allSpun = result.spins.length > 0 && passed('spin', result.spins.length - 1);
  const bestSpin = result.spins.findIndex((spin) => spin.multiplier === result.multiplier);
  const spinIndex = currentSpin(beats, at);
  const totalRef = useRef<HTMLSpanElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const landing = useWalletLanding(ui, view, reached('bank'), totalRef, walletRef);

  return (
    <div class="lg-modal lg-results" role="dialog" aria-label="Results" data-nav-scope>
      <div class="lg-panel lg-results__panel" onClick={skip}>
        <div
          class={`lg-ribbon ${result.ending.kind === 'roundOver' && result.ending.won ? 'lg-ribbon--gold' : 'lg-ribbon--purple'}`}
        >
          <h2 class="lg-ribbon__title">{endingTitle(result.ending)}</h2>
        </div>
        <div class="lg-results__main">
          <p class="lg-results__detail">{endingDetail(result.ending)}</p>
          <div class="lg-results__stats">
            <Stat icon="land" label="Peak" value={formatPermille(result.summary.peakPermille)} />
            <Stat icon="sword" label="Knockouts" value={String(result.summary.kills)} />
            <Stat icon="clock" label="Time" value={formatDuration(result.seconds)} />
          </div>
          {result.nearMiss && <p class="lg-results__near">{result.nearMiss}</p>}

          <ul class="lg-earn">
            {result.lines.map((line, i) => (
              <EarnRow key={line.id} line={line} shown={reached('line', i)} />
            ))}
            {result.lines.length === 0 && <li class="lg-earn__empty">No coins this time. Close a loop to grab land!</li>}
          </ul>

          <div class={`lg-total${reached('subtotal') ? ' is-on' : ''}${multiplied ? ' is-multiplied' : ''}`}>
            <span class="lg-total__label">Total</span>
            {multiplied && <span class="lg-total__mult">×{result.multiplier}</span>}
            <TotalValue value={shownTotal} valueRef={totalRef} />
          </div>
        </div>

        <div class="lg-results__side">
          {result.spins.length > 0 ? (
            <div class="lg-spins">
              <div class="lg-spins__title">
                <Icon name="star" /> Bonus spins <small>one per feat</small>
              </div>
              {spinIndex >= 0 ? (
                <BonusSpin key={spinIndex} ui={ui} spin={result.spins[spinIndex]} instant={skipped} />
              ) : (
                <div class="lg-spins__waiting">
                  {result.spins.length} {result.spins.length === 1 ? 'spin' : 'spins'} ready
                </div>
              )}
              <div class="lg-spins__chips">
                {result.spins.map((spin, i) => {
                  const done = passed('spin', i);
                  const best = allSpun && i === bestSpin;
                  return (
                    <span key={i} class={`lg-chip${done ? ' is-on' : ''}${best ? ' is-best' : ''}`}>
                      {done ? `×${spin.multiplier}` : '?'}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p class="lg-spins__hint">
              <Icon name="star" /> Pull off feats to earn bonus spins
            </p>
          )}

          <div class="lg-results__progress">
            <XpBar ui={ui} view={view} filled={reached('bank')} />
            <WalletChip view={view} landed={landing.landed} chipRef={walletRef} />
          </div>
          <Actions ui={ui} />
        </div>
      </div>
      {landing.flight && <FlyingCoins flight={landing.flight} onDone={landing.finish} />}
    </div>
  );
}

/** The spin on show: the latest spin beat reached, or -1 before the first. */
function currentSpin(beats: readonly Beat[], at: number): number {
  for (let i = Math.min(at, beats.length - 1); i >= 0; i--) {
    const b = beats[i];
    if (b.kind === 'spin') return b.index;
  }
  return -1;
}

function playBeat(ui: GameUi, beat: Beat, result: LifeResult): void {
  const { audio, haptics } = ui.services;
  switch (beat.kind) {
    case 'intro':
      audio.play('whoosh');
      return;
    case 'line':
      audio.play(result.lines[beat.index].coins < 0 ? 'click' : 'coin', {
        pitch: 1 + beat.index * 0.08,
      });
      return;
    case 'subtotal':
      audio.play('coinBig');
      return;
    case 'multiply':
      audio.play('combo', { pitch: 1 + Math.min(0.5, result.multiplier / 20) });
      haptics.impact('heavy');
      return;
    default:
      return;
  }
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }): JSX.Element {
  return (
    <div class="lg-stat">
      <Icon name={icon} class="lg-stat__icon" />
      <span class="lg-stat__value">{value}</span>
      <span class="lg-stat__label">{label}</span>
    </div>
  );
}

function EarnRow({ line, shown }: { line: EarningLine; shown: boolean }): JSX.Element {
  const value = useRolling(shown ? line.coins : 0, 250, 450);
  return (
    <li class={`lg-earn__row${shown ? ' is-on' : ''}${line.coins < 0 ? ' is-cost' : ''}`}>
      <Icon name={LINE_ICONS[line.id]} class="lg-earn__icon" />
      <span class="lg-earn__label">
        {line.label}
        {line.count > 0 && <small> ×{line.count}</small>}
      </span>
      <span class="lg-earn__coins">
        {line.coins < 0 ? '−' : '+'}
        {formatNumber(Math.abs(value))}
      </span>
    </li>
  );
}

function TotalValue({ value, valueRef }: { value: number; valueRef: RefObject<HTMLSpanElement> }): JSX.Element {
  const shown = useRolling(value, 300, 800);
  return (
    <span class="lg-total__value" ref={valueRef}>
      <CoinIcon />
      {formatNumber(shown)}
    </span>
  );
}

interface Flight {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Once the total is banked its coins fly into the wallet chip, which rolls up when they
 * land; the coins are gone once the last one is in.
 */
function useWalletLanding(
  ui: GameUi,
  view: ResultsView,
  banked: boolean,
  from: RefObject<HTMLElement>,
  to: RefObject<HTMLElement>,
): { flight: Flight | null; landed: boolean; finish: () => void } {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!banked || view.result.total <= 0) return;
    const source = from.current?.getBoundingClientRect();
    const target = to.current?.getBoundingClientRect();
    if (source && target) {
      setFlight({
        x0: source.left + source.width / 2,
        y0: source.top + source.height / 2,
        // The chip's coin icon.
        x1: target.left + target.height / 2,
        y1: target.top + target.height / 2,
      });
    }
    const timer = setTimeout(() => {
      setLanded(true);
      ui.services.audio.play('reward');
      ui.services.haptics.notify('success');
    }, COIN_FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [banked]);

  return { flight, landed, finish: () => setFlight(null) };
}

function WalletChip({ view, landed, chipRef }: { view: ResultsView; landed: boolean; chipRef: RefObject<HTMLDivElement> }): JSX.Element {
  const shown = useRolling(view.walletBefore + (landed ? view.result.total : 0), 500, 1200);
  return (
    <div class={`lg-wallet${landed ? ' is-bumping' : ''}`} ref={chipRef} aria-label="Wallet">
      <CoinIcon />
      <span>{formatNumber(shown)}</span>
    </div>
  );
}

/** Coins leave in turn and arrive in turn (each flight is a little shorter than the last is late), the last one calling onDone. */
function FlyingCoins({ flight, onDone }: { flight: Flight; onDone: () => void }): JSX.Element {
  return (
    <>
      {Array.from({ length: FLYING_COINS }, (_, i) => (
        <span
          key={i}
          class="lg-flying-coin"
          onAnimationEnd={i === FLYING_COINS - 1 ? onDone : undefined}
          style={{
            '--x0': `${flight.x0 + (i % 4) * 9 - 14}px`,
            '--y0': `${flight.y0 + Math.floor(i / 4) * 7 - 7}px`,
            '--x1': `${flight.x1}px`,
            '--y1': `${flight.y1}px`,
            animationDelay: `${i * 22}ms`,
            animationDuration: `${COIN_FLIGHT_MS - i * 12}ms`,
          }}
        >
          <CoinIcon />
        </span>
      ))}
    </>
  );
}

function Actions({ ui }: { ui: GameUi }): JSX.Element {
  const round = ui.round.value;
  const waiting = round !== null;
  const now = useMatchClock(ui, 250, waiting);
  const seconds = round ? Math.max(0, Math.ceil((round.nextAt - now) / 1000)) : 0;
  return (
    <div class="lg-results__actions" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="gold"
        size="xl"
        icon="play"
        pulse
        data-autofocus
        locked={waiting}
        class="lg-play-again"
        onClick={() => ui.actions.playAgain()}
      >
        {waiting ? `Next map in ${seconds}` : 'Play again'}
      </Button>
      <Button variant="slate" icon="home" onClick={() => ui.actions.exitToHub()}>
        Back to hub
      </Button>
    </div>
  );
}
