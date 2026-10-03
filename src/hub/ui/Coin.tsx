/** Coin glyph followed by an amount, e.g. on price tags and reward chips. */
import { CoinIcon } from '../../shared/ui/kit';
import { formatNumber } from './format';
import './coin.css';

export function CoinAmount({ amount, class: className }: { amount: number; class?: string }) {
  return (
    <span class={className ? `coin-amount ${className}` : 'coin-amount'}>
      <CoinIcon />
      <span>{formatNumber(amount)}</span>
    </span>
  );
}
