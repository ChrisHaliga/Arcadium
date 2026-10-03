/**
 * The account XP bar on the results screen. It shows where the player stood before this
 * life, then fills with the XP earned; a level-up fills it to the end, celebrates, and
 * carries on from the start of the new level.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatNumber } from './hooks';
import type { GameUi, ResultsView } from './store';

const LEVEL_UP_HOLD_MS = 700;

type Phase = 'before' | 'levelUp' | 'after';

export function XpBar({ ui, view, filled }: { ui: GameUi; view: ResultsView; filled: boolean }): JSX.Element {
  const { progress } = ui.services;
  const levelAfter = progress.level.value;
  const leveledUp = levelAfter > view.levelBefore;
  const [phase, setPhase] = useState<Phase>('before');

  useEffect(() => {
    if (!filled) return;
    if (!leveledUp) {
      setPhase('after');
      return;
    }
    setPhase('levelUp');
    ui.services.audio.play('levelUp');
    const timer = setTimeout(() => setPhase('after'), LEVEL_UP_HOLD_MS);
    return () => clearTimeout(timer);
  }, [filled]);

  const share =
    phase === 'before'
      ? view.xpBefore / Math.max(1, view.xpToNextBefore)
      : phase === 'levelUp'
        ? 1
        : progress.xp.value / Math.max(1, progress.xpToNext.value);
  const level = phase === 'after' ? levelAfter : view.levelBefore;
  return (
    <div class={`lg-xp${phase === 'levelUp' ? ' is-level-up' : ''}`}>
      <span class="lg-xp__level" key={level}>
        <small>Lv</small>
        {level}
      </span>
      <span class="lg-xp__track">
        <span
          class="lg-xp__fill"
          // Jumping back to the start of a new level must not animate backwards.
          style={{
            width: `${Math.min(1, share) * 100}%`,
            transition: phase === 'after' && leveledUp ? 'none' : undefined,
          }}
        />
        <span class="lg-xp__label">{phase === 'levelUp' ? 'Level up!' : `+${formatNumber(view.result.xp)} XP`}</span>
      </span>
    </div>
  );
}
