/** Home: game carousel, the big Play button, and shortcuts to what's waiting (daily reward, chests). */
import type { LaunchOptions } from '../../../shared/game';
import { Button, Icon, type IconName } from '../../../shared/ui/kit';
import { useAttention } from '../../attention';
import { useHub } from '../../context';
import { Badge } from '../../ui/Badge';
import { cx } from '../../ui/format';
import { GameCarousel } from './GameCarousel';
import './home.css';

export function Home() {
  const { games, store, launcher, feedback } = useHub();
  const attention = useAttention();
  const selected = games.find((g) => g.id === store.selectedGame.value) ?? games[0];

  const play = (mode: LaunchOptions['mode'], e: MouseEvent) => {
    const button = e.currentTarget as HTMLElement;
    if (!selected.available) {
      feedback.error('Not playable yet. Coming soon!', button);
      return;
    }
    launcher.launch(selected, mode, button);
  };

  return (
    <div class="home">
      <div class="home__rail">
        <RailButton
          icon="gift"
          label="Daily"
          tone="pink"
          badge={attention.dailyClaimable ? 1 : 0}
          onClick={() => store.open({ kind: 'daily' })}
        />
        {attention.heldChests > 0 && (
          <RailButton
            icon="chest"
            label="Chests"
            tone="gold"
            badge={attention.heldChests}
            onClick={() => store.setTab('shop')}
          />
        )}
      </div>

      <div class="home__stage">
        <GameCarousel games={games} selectedId={selected.id} onSelect={store.selectGame} />
      </div>

      <div class="home__actions">
        {selected.available ? (
          <Button
            variant="gold"
            size="xl"
            pulse
            class="home__play"
            data-sfx="none"
            data-autofocus
            onClick={(e) => play('online', e)}
          >
            <span class="home__play-text">
              <span class="home__play-main">PLAY</span>
              <span class="home__play-sub">
                <Icon name="globe" /> Online
              </span>
            </span>
          </Button>
        ) : (
          <Button variant="slate" size="xl" icon="lock" class="home__play" onClick={(e) => play('online', e)}>
            <span class="home__play-main home__play-main--soon">Coming soon</span>
          </Button>
        )}
        <Button
          variant="purple"
          icon="bot"
          class="home__practice"
          disabled={!selected.available}
          onClick={(e) => play('offline', e)}
        >
          Practice offline
        </Button>
      </div>
    </div>
  );
}

interface RailButtonProps {
  icon: IconName;
  label: string;
  tone: 'pink' | 'gold';
  badge: number;
  onClick(): void;
}

function RailButton({ icon, label, tone, badge, onClick }: RailButtonProps) {
  return (
    <button type="button" class={cx('rail-btn', `rail-btn--${tone}`, badge > 0 && 'is-waiting')} onClick={onClick}>
      <span class="rail-btn__face">
        <Icon name={icon} class="rail-btn__icon" />
        <Badge count={badge} />
      </span>
      <span class="rail-btn__label">{label}</span>
    </button>
  );
}
