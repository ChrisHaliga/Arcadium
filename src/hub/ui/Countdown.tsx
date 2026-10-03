/** "New in 5h 12m": a clock chip that ticks with the hub's one-second clock. */
import { Icon } from '../../shared/ui/kit';
import { useHub } from '../context';
import { formatCountdown } from './format';
import './widgets.css';

export function Countdown({ until, prefix }: { until: number; prefix?: string }) {
  const { store } = useHub();
  return (
    <span class="countdown">
      <Icon name="clock" />
      <span>
        {prefix && `${prefix} `}
        {formatCountdown(until - store.now.value)}
      </span>
    </span>
  );
}
