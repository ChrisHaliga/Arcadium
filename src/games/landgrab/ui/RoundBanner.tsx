/**
 * Round over: who took the map and the countdown to the next one. Winning yourself gets
 * the full-screen celebration first, then it settles into the banner.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../../../shared/ui/kit';
import { useMatchClock } from './hooks';
import type { GameUi, RoundView } from './store';
import { ROUND_BEAT_MS } from './timing';
import './round.css';

const CONFETTI_COLORS = ['#ff3b5c', '#ffd21f', '#1fd6a0', '#1fb4ff', '#9b3dff', '#ff8a1f', '#ffffff'];
const CONFETTI_PIECES = 46;

export function RoundBanner({ ui, round }: { ui: GameUi; round: RoundView }): JSX.Element {
  const now = useMatchClock(ui, 200);
  const seconds = Math.max(0, Math.ceil((round.nextAt - now) / 1000));
  const [big, setBig] = useState(true);
  const lastSecond = useRef(seconds);

  useEffect(() => {
    const timer = setTimeout(() => setBig(false), ROUND_BEAT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (seconds === lastSecond.current) return;
    lastSecond.current = seconds;
    if (seconds > 0 && seconds <= 3) ui.services.audio.play('countdown');
  }, [seconds]);

  return (
    <div class={`lg-round${big ? ' is-big' : ''}${round.me ? ' is-me' : ''}`} style={{ '--winner': round.winnerColor }}>
      {round.me && big && <Confetti />}
      <div class="lg-round__card">
        <Icon name="crown" class="lg-round__crown" />
        <div class="lg-round__title">{round.me ? 'You win the round!' : `${round.winner} wins the round!`}</div>
        <div class="lg-round__next">
          {seconds > 0 ? (
            <>
              Next map in <strong key={seconds}>{seconds}</strong>
            </>
          ) : (
            'New map!'
          )}
        </div>
      </div>
    </div>
  );
}

function Confetti(): JSX.Element {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.6 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 160,
        spin: (Math.random() - 0.5) * 1080,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        wide: i % 3 === 0,
      })),
    [],
  );
  return (
    <div class="lg-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          class={`lg-confetti__piece${p.wide ? ' is-wide' : ''}`}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
