/**
 * A feat's bonus spin: one round window of faces, each a game icon with its multiplier
 * printed on it, that scrolls, slows down and stops on the result, beside the feat that
 * earned it. A single face decides the spin, so it reads as a reward rolled for the
 * feat rather than a machine with symbols to line up.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { FEAT_TITLES, REEL_FACES, type ReelFace, type ReelSpin } from '../rewards';
import { ReelArt } from './ReelArt';
import type { GameUi } from './store';
import './spin.css';

/** From the spin starting to the window stopping. */
const STOP_MS = 1300;
/** From the spin starting to its multiplier showing. */
export const SPIN_REVEAL_MS = STOP_MS + 220;
/** Times the strip goes past every face before it stops. */
const LAPS = 3;
/** Multipliers from here up get the gold treatment. */
const HIGH_MULTIPLIER = 5;

interface BonusSpinProps {
  ui: GameUi;
  spin: ReelSpin;
  /** Show the result without animating (the player skipped ahead). */
  instant: boolean;
}

/** One spin; give each spin its own key so it starts from a fresh strip. */
export function BonusSpin({ ui, spin, instant }: BonusSpinProps): JSX.Element {
  const strip = useMemo(() => stripEndingOn(spin.multiplier), [spin.multiplier]);
  const [going, setGoing] = useState(false);
  const [revealed, setRevealed] = useState(instant);
  const paying = spin.multiplier > 1;
  const high = spin.multiplier >= HIGH_MULTIPLIER;

  useEffect(() => {
    if (instant) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    const { audio, haptics } = ui.services;
    audio.play('reelSpin');
    // Two frames: the strip must be laid out at its start before the transition to its end begins.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGoing(true));
    });
    const stop = setTimeout(() => {
      audio.play('reelStop');
      haptics.impact('light');
    }, STOP_MS);
    const reveal = setTimeout(() => {
      setRevealed(true);
      if (high) audio.play('milestone');
      else if (paying) audio.play('feat', { pitch: 1 + spin.multiplier * 0.05 });
      if (paying) haptics.impact(high ? 'heavy' : 'medium');
    }, SPIN_REVEAL_MS);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(stop);
      clearTimeout(reveal);
    };
  }, [instant]);

  const atEnd = instant || going;
  return (
    <div class={`lg-spin${revealed && paying ? ' is-paying' : ''}${revealed && high ? ' is-high' : ''}`}>
      <div class="lg-spin__window" aria-hidden="true">
        <div
          class="lg-spin__strip"
          style={{
            transform: `translateY(calc(${atEnd ? -(strip.length - 1) : 0} * var(--face)))`,
            transition: atEnd && !instant ? `transform ${STOP_MS}ms cubic-bezier(0.18, 0.62, 0.3, 1.04)` : 'none',
          }}
        >
          {strip.map((face, i) => (
            <div key={i} class="lg-spin__face">
              <ReelArt icon={face.icon} />
              <span class="lg-spin__tag">×{face.multiplier}</span>
            </div>
          ))}
        </div>
      </div>
      <div class="lg-spin__info">
        <span class="lg-spin__feat">{FEAT_TITLES[spin.feat]}</span>
        <span class={`lg-spin__result${revealed ? ' is-on' : ''}`}>{revealed ? `×${spin.multiplier}` : '…'}</span>
      </div>
    </div>
  );
}

/**
 * The faces the window shows, first to last: starting half a lap from the result (so it
 * isn't given away before the spin), LAPS laps through every face, ending on the result.
 * They come up in falling order, like a wheel turning toward the viewer.
 */
function stripEndingOn(multiplier: number): ReelFace[] {
  const n = REEL_FACES.length;
  const end = Math.max(0, REEL_FACES.findIndex((face) => face.multiplier === multiplier));
  const strip: ReelFace[] = [];
  for (let i = LAPS * n + Math.ceil(n / 2); i >= 0; i--) strip.push(REEL_FACES[(end + i) % n]);
  return strip;
}
