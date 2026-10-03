/** Daily reward calendar: seven tiles, today's pulsing, streak and streak-freeze info. */
import { useRef, useState, type MutableRef } from 'preact/hooks';
import type { ChestType, DailyReward } from '../../meta';
import { Button, CoinIcon, Icon } from '../../shared/ui/kit';
import { useHub } from '../context';
import { RARITY_COLORS } from '../cosmetics/labels';
import type { Overlay } from '../store';
import { ChestArt } from '../ui/ChestArt';
import { CoinAmount } from '../ui/Coin';
import { Countdown } from '../ui/Countdown';
import { cx, formatNumber } from '../ui/format';
import { Modal } from '../ui/Modal';
import { openHeldChest } from './chestFlow';
import './daily.css';

type TileStatus = 'claimed' | 'today' | 'next' | 'later';

export function DailyRewards({ overlay }: { overlay: Overlay }) {
  const hub = useHub();
  const { meta, store, coins, particles, feedback } = hub;
  const { daily } = meta;
  const state = daily.state.value;
  const [wonChest, setWonChest] = useState<ChestType | null>(null);
  const todayTile = useRef<HTMLButtonElement>(null);

  const status = (day: number): TileStatus => {
    if (state.claimable) return day < state.day ? 'claimed' : day === state.day ? 'today' : 'later';
    if (day <= state.day) return 'claimed';
    return day === (state.day % daily.calendar.length) + 1 ? 'next' : 'later';
  };

  const claim = (source: Element) => {
    const reward = coins.withSource(source, () => daily.claim());
    if (!reward) return;
    feedback.success();
    const r = source.getBoundingClientRect();
    particles.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: RARITY_COLORS.legendary, count: 50, speed: 650 });
    if (reward.chest) setWonChest(reward.chest);
  };

  const buyFreeze = (e: MouseEvent) => {
    if (meta.services.wallet.coins.value < daily.freezePrice) {
      feedback.notEnoughCoins();
      return;
    }
    if (!daily.buyFreeze()) return;
    feedback.success('Streak freeze ready');
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    particles.burst(r.left + r.width / 2, r.top + r.height / 2, {
      colors: ['#bfefff', '#ffffff', '#7ad3ff'],
      kind: 'stars',
      count: 18,
      speed: 320,
    });
  };

  return (
    <Modal title="Daily Rewards" tone="gold" size="m" class="daily-panel" onClose={() => store.close(overlay)}>
      <div class="daily">
        <div class="daily__streak">
          <span class="daily__flame">
            <Icon name="flame" />
            <span>{state.streak}</span>
          </span>
          <span class="daily__streak-text">
            <strong>{state.streak === 1 ? '1 day streak' : `${state.streak} day streak`}</strong>
            <span>Come back every day for bigger rewards</span>
          </span>
        </div>

        {state.freezesUsedToday > 0 && (
          <p class="daily__notice daily__notice--saved">
            <Icon name="snowflake" />
            {state.freezesUsedToday === 1 ? 'A streak freeze' : `${state.freezesUsedToday} streak freezes`} saved your
            streak!
          </p>
        )}
        {state.streakLostToday > 0 && (
          <p class="daily__notice daily__notice--lost">
            <Icon name="flame" />
            Your {state.streakLostToday}-day streak ended. Start a new one today!
          </p>
        )}

        <div class="daily__grid">
          {daily.calendar.map((reward) => (
            <DayTile
              key={reward.day}
              reward={reward}
              status={status(reward.day)}
              tileRef={todayTile}
              onClaim={claim}
            />
          ))}
        </div>

        <div class="daily__cta">
          {state.claimable ? (
            <Button
              variant="green"
              size="l"
              pulse
              data-sfx="none"
              data-autofocus
              onClick={(e) => claim(todayTile.current ?? e.currentTarget)}
            >
              Claim day {state.day}
            </Button>
          ) : wonChest ? (
            <Button
              variant="gold"
              size="l"
              icon="chest"
              pulse
              data-sfx="none"
              data-autofocus
              onClick={() => openHeldChest(hub, wonChest, overlay)}
            >
              Open your chest!
            </Button>
          ) : (
            <Countdown until={state.nextResetAt} prefix="Next reward in" />
          )}
        </div>

        <div class="daily__freeze">
          <span class="daily__freeze-icons" aria-label={`${state.freezes} of ${daily.maxFreezes} streak freezes`}>
            {Array.from({ length: daily.maxFreezes }, (_, i) => (
              <span key={i} class={cx('daily__freeze-slot', i < state.freezes && 'is-full')}>
                <Icon name="snowflake" />
              </span>
            ))}
          </span>
          <span class="daily__freeze-text">
            <strong>Streak freeze</strong>
            <span>Covers a missed day automatically</span>
          </span>
          <Button
            variant="blue"
            size="s"
            disabled={state.freezes >= daily.maxFreezes}
            aria-label={`Buy a streak freeze for ${formatNumber(daily.freezePrice)} coins`}
            onClick={buyFreeze}
          >
            {state.freezes >= daily.maxFreezes ? 'Full' : <CoinAmount amount={daily.freezePrice} />}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface DayTileProps {
  reward: DailyReward;
  status: TileStatus;
  /** Attached to today's tile, the spot the claimed coins fly from. */
  tileRef: MutableRef<HTMLButtonElement | null>;
  onClaim(el: Element): void;
}

function DayTile({ reward, status, tileRef, onClaim }: DayTileProps) {
  const big = reward.chest !== null;
  const stack = reward.coins >= 1500 ? 3 : reward.coins >= 750 ? 2 : 1;
  const content = (
    <>
      <span class="day-tile__label">{status === 'next' ? 'Next' : `Day ${reward.day}`}</span>
      <span class="day-tile__prize">
        {reward.chest ? (
          <ChestArt type={reward.chest} class="day-tile__chest" />
        ) : (
          <span class={`day-tile__coins day-tile__coins--${stack}`}>
            {Array.from({ length: stack }, (_, i) => (
              <CoinIcon key={i} />
            ))}
          </span>
        )}
      </span>
      <span class="day-tile__amount">{reward.chest ? 'Big Chest' : formatNumber(reward.coins)}</span>
      {status === 'claimed' && (
        <span class="day-tile__check">
          <Icon name="check" />
        </span>
      )}
    </>
  );
  const classes = cx('day-tile', `is-${status}`, big && 'day-tile--big');
  return status === 'today' ? (
    <button type="button" class={classes} ref={tileRef} data-sfx="none" onClick={(e) => onClaim(e.currentTarget)}>
      {content}
    </button>
  ) : (
    <div class={classes}>{content}</div>
  );
}
