/** Chunky on/off switch. */
import { cx } from './format';
import './widgets.css';

interface SwitchProps {
  checked: boolean;
  label: string;
  onChange(next: boolean): void;
}

export function Switch({ checked, label, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class={cx('switch', checked && 'switch--on')}
      onClick={() => onChange(!checked)}
    >
      <span class="switch__knob" />
      <span class="switch__text" aria-hidden="true">
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
