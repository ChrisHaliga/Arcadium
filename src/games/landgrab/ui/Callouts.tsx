/**
 * Big centre-screen callouts for feats, milestones, treasure and wins, plus the punchy
 * flash on a kill. A feat's multiplier rolls through the possible values, slows down
 * and lands on the one rolled.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CoinIcon } from '../../../shared/ui/kit';
import { formatNumber } from './hooks';
import type { CalloutView, GameUi } from './store';
import { FEAT_ROLL_MS } from './timing';
import './callouts.css';

const ROLL_STEPS = 12;

export function Callouts({ ui }: { ui: GameUi }): JSX.Element {
  return (
    <div class="lg-callouts" aria-live="polite">
      {ui.callouts.value.map((callout) => (
        <Callout key={callout.id} callout={callout} ui={ui} />
      ))}
    </div>
  );
}

function Callout({ callout, ui }: { callout: CalloutView; ui: GameUi }): JSX.Element {
  const [landed, setLanded] = useState(callout.roll === null);
  return (
    <div class={`lg-callout lg-callout--${callout.kind}`}>
      <div class="lg-callout__title">{callout.title}</div>
      {callout.detail && <div class="lg-callout__detail">{callout.detail}</div>}
      <div class="lg-callout__reward">
        {callout.roll && <RollBadge roll={callout.roll} ui={ui} onLand={() => setLanded(true)} />}
        {landed && (
          <span class="lg-callout__coins">
            <CoinIcon />+{formatNumber(callout.coins)}
          </span>
        )}
      </div>
    </div>
  );
}

function RollBadge({
  roll,
  ui,
  onLand,
}: {
  roll: NonNullable<CalloutView['roll']>;
  ui: GameUi;
  onLand: () => void;
}): JSX.Element {
  const faces = roll.faces;
  const target = Math.max(0, faces.indexOf(roll.multiplier));
  const faceAt = (step: number) => faces[(((target - (ROLL_STEPS - step)) % faces.length) + faces.length) % faces.length];
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= ROLL_STEPS) {
      ui.services.audio.play('reelStop', {
        pitch: 1 + Math.min(0.5, roll.multiplier / 20),
      });
      onLand();
      return;
    }
    ui.services.audio.play('click', { pitch: 1.4 + step * 0.05, volume: 0.5 });
    const timer = setTimeout(() => setStep(step + 1), stepDelay(step));
    return () => clearTimeout(timer);
  }, [step]);

  const landed = step >= ROLL_STEPS;
  return (
    <span class={`lg-roll${landed ? ' is-landed' : ''}${landed && roll.multiplier >= 5 ? ' is-hot' : ''}`}>
      ×{landed ? roll.multiplier : faceAt(step)}
    </span>
  );
}

/** Quick at first, slowing toward the stop; the steps add up to FEAT_ROLL_MS. */
function stepDelay(step: number): number {
  const weight = (i: number) => 1 + 3 * (i / ROLL_STEPS) ** 2;
  let total = 0;
  for (let i = 0; i < ROLL_STEPS; i++) total += weight(i);
  return (FEAT_ROLL_MS * weight(step)) / total;
}

export function KillFlash({ ui }: { ui: GameUi }): JSX.Element | null {
  const flash = ui.flash.value;
  return flash > 0 ? <div key={flash} class="lg-flash" aria-hidden="true" /> : null;
}
