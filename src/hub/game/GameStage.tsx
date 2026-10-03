/** The element games mount into, and the curtain that hides the switch between hub and game. */
import { useEffect, useRef } from 'preact/hooks';
import { useHub } from '../context';
import { cx } from '../ui/format';
import './game.css';

export function GameStage() {
  const { launcher } = useHub();
  const host = useRef<HTMLDivElement>(null);
  const phase = launcher.phase.value;
  const session = launcher.session.value;

  useEffect(() => {
    launcher.setHost(host.current);
    return () => launcher.setHost(null);
  }, [launcher]);

  return (
    <>
      <div ref={host} class={cx('game-host', launcher.gameActive.value && 'is-active')} />
      {session && phase !== 'idle' && (
        <div
          class={`curtain curtain--${phase}`}
          style={{ '--accent': session.game.accent, '--x': `${session.origin.x}px`, '--y': `${session.origin.y}px` }}
          aria-hidden="true"
        >
          <div class="curtain__title headline">{session.game.title}</div>
          <div class="curtain__dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </>
  );
}
