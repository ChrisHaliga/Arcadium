/**
 * The second-chance offer after a death: a ring counts down the revive window while the
 * player's land waits for them. The price rises with each revive in a round; when the
 * player can't cover it the button stays visible but disabled, with how much is missing,
 * and keyboard and pad focus go to "No thanks" instead.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button, CoinIcon, Icon } from '../../../shared/ui/kit';
import { formatNumber, formatPermille, useMatchClock } from './hooks';
import type { GameUi, SecondChanceView } from './store';
import './panels.css';

const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function SecondChance({ ui, offer }: { ui: GameUi; offer: SecondChanceView }): JSX.Element {
  const now = useMatchClock(ui, 100);
  const leftMs = Math.max(0, offer.deadline - now);
  const seconds = Math.ceil(leftMs / 1000);
  const lastSecond = useRef(seconds);

  useEffect(() => {
    if (seconds === lastSecond.current) return;
    lastSecond.current = seconds;
    if (seconds > 0)
      ui.services.audio.play('countdown', {
        pitch: 1 + (3 - Math.min(3, seconds)) * 0.08,
      });
  }, [seconds]);

  // The ring drains by CSS, measured once from wherever the window stands when the offer
  // opens, and pauses with the match.
  const [ring] = useState(() => {
    const left = Math.max(0, offer.deadline - ui.clock());
    return {
      from: RING_LENGTH * (1 - Math.min(1, left / offer.windowMs)),
      ms: left,
    };
  });
  const affordable = offer.shortBy === 0;
  return (
    <div class="lg-modal" role="dialog" aria-label="Second chance" data-nav-scope>
      <div class="lg-modal__backdrop lg-modal__backdrop--soft" />
      <div class={`lg-panel lg-chance${ui.frozen.value ? ' is-frozen' : ''}`}>
        <div class="lg-ribbon lg-ribbon--pink">
          <h2 class="lg-ribbon__title">Second chance!</h2>
        </div>
        <div class={`lg-ring${seconds <= 2 ? ' is-urgent' : ''}`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="lg-ring__track" cx="50" cy="50" r={RING_RADIUS} />
            <circle
              class="lg-ring__fill"
              cx="50"
              cy="50"
              r={RING_RADIUS}
              style={{
                strokeDasharray: `${RING_LENGTH}px`,
                '--ring-from': `${ring.from}px`,
                '--ring-to': `${RING_LENGTH}px`,
                animationDuration: `${ring.ms}ms`,
              }}
            />
          </svg>
          <span class="lg-ring__seconds" key={seconds}>
            {seconds}
          </span>
        </div>
        <p class="lg-chance__keep">
          Keep your <strong>{formatPermille(offer.keptPermille)}</strong> of the map
        </p>
        <Button
          variant="gold"
          size="l"
          pulse={affordable}
          disabled={!affordable}
          locked={offer.pending || leftMs === 0}
          data-autofocus={affordable || undefined}
          class="lg-chance__revive"
          onClick={() => ui.actions.revive()}
        >
          <Icon name="heart" class="lg-chance__heart" />
          Revive
          <span class="lg-price">
            <CoinIcon />
            {formatNumber(offer.price)}
          </span>
        </Button>
        {affordable ? (
          <p class="lg-chance__note">
            {offer.revivesLeft} {offer.revivesLeft === 1 ? 'second chance' : 'second chances'} left this round
          </p>
        ) : (
          <p class="lg-chance__note lg-chance__note--short">
            You need <CoinIcon /> {formatNumber(offer.shortBy)} more {offer.shortBy === 1 ? 'coin' : 'coins'}
          </p>
        )}
        <button
          type="button"
          class="lg-link"
          data-autofocus={!affordable || undefined}
          onClick={() => ui.actions.declineRevive()}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
