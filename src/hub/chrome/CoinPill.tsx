/**
 * Wallet counter. It rolls toward the balance minus coins still flying in, and bumps as
 * each one lands. Tapping it opens the shop (where coins are spent; they are only earned).
 */
import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { CoinIcon } from '../../shared/ui/kit';
import { useHub } from '../context';
import { replayClass } from '../fx/motion';
import { useRollingNumber } from '../fx/rolling';
import { formatCompact, formatNumber } from '../ui/format';

export function CoinPill() {
  const { meta, coins, store } = useHub();
  const icon = useRef<HTMLSpanElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const balance = meta.services.wallet.coins.value;
  const shown = useRollingNumber(Math.max(0, balance - coins.held.value));

  useEffect(() => {
    coins.setTarget(icon.current);
    return () => coins.setTarget(null);
  }, [coins]);

  useSignalEffect(() => {
    if (coins.landed.value === 0) return;
    replayClass(icon.current, 'is-bumping');
    replayClass(value.current, 'is-bumping');
  });

  return (
    <button
      type="button"
      class="coin-pill"
      aria-label={`${formatNumber(balance)} coins. Open the shop`}
      onClick={() => store.setTab('shop')}
    >
      <span class="coin-pill__icon" ref={icon}>
        <CoinIcon />
      </span>
      <span class="coin-pill__value" ref={value}>
        {formatCompact(shown)}
      </span>
    </button>
  );
}
