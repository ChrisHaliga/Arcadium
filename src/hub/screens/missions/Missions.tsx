/** Missions: daily and weekly goals with progress, claim buttons, rerolls and reset timers. */
import { useState } from 'preact/hooks';
import type { ActiveMission } from '../../../meta';
import { Button, Icon } from '../../../shared/ui/kit';
import { isClaimable } from '../../attention';
import { useHub } from '../../context';
import { RARITY_COLORS } from '../../cosmetics/labels';
import { statIcon } from '../../statIcons';
import { Badge } from '../../ui/Badge';
import { CoinAmount } from '../../ui/Coin';
import { Countdown } from '../../ui/Countdown';
import { cx, formatNumber } from '../../ui/format';
import { ProgressBar } from '../../ui/ProgressBar';
import '../page.css';
import './missions.css';

type Cadence = 'daily' | 'weekly';

export function Missions() {
  const { meta } = useHub();
  const [cadence, setCadence] = useState<Cadence>(() =>
    meta.missions.daily.value.some(isClaimable) || !meta.missions.weekly.value.some(isClaimable) ? 'daily' : 'weekly',
  );
  const lists: Record<Cadence, readonly ActiveMission[]> = {
    daily: meta.missions.daily.value,
    weekly: meta.missions.weekly.value,
  };
  const resetsAt = cadence === 'daily' ? meta.missions.dailyResetsAt.value : meta.missions.weeklyResetsAt.value;
  const rerollCost = meta.missions.rerollCost.value;

  return (
    <div class="page scroll-y">
      <div class="page__inner missions">
        <header class="page__header">
          <h1 class="page__title headline">Missions</h1>
          <Countdown until={resetsAt} prefix="Resets in" />
        </header>

        <div class="segmented" role="tablist" aria-label="Mission period">
          {(['daily', 'weekly'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === cadence}
              class={cx('segmented__tab', c === cadence && 'is-active')}
              onClick={() => setCadence(c)}
            >
              {c === 'daily' ? 'Daily' : 'Weekly'}
              <Badge count={lists[c].filter(isClaimable).length} />
            </button>
          ))}
        </div>

        <ul class="mission-list" key={cadence}>
          {lists[cadence].map((m, i) => (
            <MissionCard key={m.def.id} mission={m} index={i} rerollCost={rerollCost} />
          ))}
        </ul>

        <p class="missions__hint">
          <Icon name="refresh" />
          {rerollCost === 0
            ? 'One free reroll left today. Swap a mission you don’t fancy.'
            : `Free reroll used. More rerolls cost ${formatNumber(rerollCost)} coins.`}
        </p>
      </div>
    </div>
  );
}

function MissionCard({ mission, index, rerollCost }: { mission: ActiveMission; index: number; rerollCost: number }) {
  const { meta, games, coins, feedback, particles, audio } = useHub();
  const { def, progress, complete, claimed } = mission;
  const game = games.find((g) => g.id === def.gameId);

  const claim = (e: MouseEvent) => {
    const button = e.currentTarget as HTMLElement;
    const granted = coins.withSource(button, () => meta.missions.claim(def.id));
    if (granted === null) return;
    feedback.success();
    const r = button.getBoundingClientRect();
    particles.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: RARITY_COLORS.legendary, count: 36, speed: 520 });
  };

  const reroll = (e: MouseEvent) => {
    if (meta.services.wallet.coins.value < rerollCost) {
      feedback.notEnoughCoins();
      return;
    }
    if (!meta.missions.reroll(def.id)) {
      feedback.error('No other missions to swap in', (e.currentTarget as HTMLElement).closest('.mission'));
      return;
    }
    audio.play('whoosh', { pitch: 1.4, volume: 0.6 });
  };

  return (
    <li
      class={cx('mission panel', complete && 'is-complete', claimed && 'is-claimed')}
      style={{ animationDelay: `${index * 0.06}s`, '--accent': game?.accent ?? 'var(--blue)' }}
    >
      <span class="mission__icon">
        <Icon name={statIcon(def.stat)} />
      </span>
      <div class="mission__body">
        {game && <span class="mission__game">{game.title}</span>}
        <span class="mission__title">{def.title}</span>
        <ProgressBar value={progress} max={def.target} tone={complete ? 'gold' : 'green'}>
          {formatNumber(progress)} / {formatNumber(def.target)}
        </ProgressBar>
      </div>
      <div class="mission__side">
        <CoinAmount amount={def.reward} class="mission__reward" />
        {claimed ? (
          <span class="mission__done">
            <Icon name="check" /> Done
          </span>
        ) : complete ? (
          <Button variant="green" size="s" pulse data-sfx="none" onClick={claim}>
            Claim
          </Button>
        ) : (
          <Button variant="slate" size="s" icon="refresh" aria-label={`Reroll: ${def.title}`} onClick={reroll}>
            {rerollCost === 0 ? 'Free' : <CoinAmount amount={rerollCost} />}
          </Button>
        )}
      </div>
    </li>
  );
}
