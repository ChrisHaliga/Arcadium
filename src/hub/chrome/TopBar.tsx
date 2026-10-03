/** Always-visible header: avatar with level ring, name, XP bar, wallet and settings. */
import { playerColor } from '../../games/registry';
import { LEVELS } from '../../meta/config';
import { Icon } from '../../shared/ui/kit';
import { useHub } from '../context';
import { Avatar } from '../ui/Avatar';
import { formatNumber } from '../ui/format';
import { ProgressBar } from '../ui/ProgressBar';
import { CoinPill } from './CoinPill';
import './topbar.css';

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

interface ShownLevel {
  level: number;
  xp: number;
  xpToNext: number;
}

/**
 * Level-ups are celebrated one at a time, after the fact (one life can earn several), and
 * the top bar stays visible over the celebration. So while any are on screen or waiting,
 * it holds the level being celebrated, or the full bar just before the next one, instead
 * of already showing the final level.
 */
function useShownLevel(): ShownLevel {
  const { meta, store } = useHub();
  const { progress } = meta.services;
  const current = { level: progress.level.value, xp: progress.xp.value, xpToNext: progress.xpToNext.value };
  const onScreen = store.overlays.value.flatMap((o) => (o.kind === 'levelUp' ? [o.levelUp.level] : []));
  if (onScreen.length > 0) {
    const level = Math.min(...onScreen);
    return level < current.level ? { level, xp: 0, xpToNext: LEVELS.xpToNext(level) } : current;
  }
  const waiting = meta.levelUps.pending.value;
  if (waiting.length === 0) return current;
  const level = Math.min(...waiting.map((l) => l.level)) - 1;
  const xpToNext = LEVELS.xpToNext(level);
  return { level, xp: xpToNext, xpToNext };
}

export function TopBar() {
  const { meta, store } = useHub();
  const { profile } = meta.services;
  const { level, xp, xpToNext } = useShownLevel();
  const share = xpToNext > 0 ? xp / xpToNext : 0;

  return (
    <header class="topbar">
      <button
        type="button"
        class="topbar__profile"
        aria-label={`${profile.name.value}, level ${level}. Open the locker`}
        onClick={() => store.setTab('locker')}
      >
        <span class="level-ring">
          <svg class="level-ring__svg" viewBox="0 0 48 48" aria-hidden="true">
            <circle class="level-ring__track" cx="24" cy="24" r={RING_R} />
            <circle
              class="level-ring__fill"
              cx="24"
              cy="24"
              r={RING_R}
              stroke-dasharray={RING_C}
              stroke-dashoffset={RING_C * (1 - share)}
            />
          </svg>
          <Avatar color={playerColor(profile.color.value)} class="level-ring__avatar" />
          <span class="level-ring__level" key={level}>
            {level}
          </span>
        </span>
        <span class="topbar__who">
          <span class="topbar__name">{profile.name.value}</span>
          <ProgressBar value={xp} max={xpToNext} tone="xp" class="topbar__xp">
            {formatNumber(xp)} / {formatNumber(xpToNext)} XP
          </ProgressBar>
        </span>
      </button>
      <CoinPill />
      <button
        type="button"
        class="topbar__gear"
        aria-label="Settings"
        onClick={() => store.open({ kind: 'settings' })}
      >
        <Icon name="gear" />
      </button>
    </header>
  );
}
