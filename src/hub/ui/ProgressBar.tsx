/** A fat rounded progress bar with an optional label drawn over it. */
import type { ComponentChildren } from 'preact';
import { cx } from './format';
import './widgets.css';

interface ProgressBarProps {
  value: number;
  max: number;
  tone?: 'xp' | 'gold' | 'green';
  children?: ComponentChildren;
  class?: string;
}

export function ProgressBar({ value, max, tone = 'green', children, class: className }: ProgressBarProps) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      class={cx('progress', `progress--${tone}`, share >= 1 && 'progress--full', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div class="progress__fill" style={{ width: `${share * 100}%` }} />
      {children !== undefined && <div class="progress__label">{children}</div>}
    </div>
  );
}
