/** The chunky 3D game button: a glossy face on a darker edge that sinks when pressed. */
import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { Icon, type IconName } from './Icon';
import './tokens.css';
import './motion.css';
import './button.css';

export type ButtonVariant = 'gold' | 'green' | 'blue' | 'pink' | 'purple' | 'slate';
export type ButtonSize = 's' | 'm' | 'l' | 'xl';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon' | 'size' | 'class' | 'type' | 'disabled'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Round icon-only button. */
  round?: boolean;
  /** Breathing glow for the button to press next; a disabled or locked button holds still. */
  pulse?: boolean;
  disabled?: boolean;
  /**
   * Looks disabled and ignores presses, yet keeps keyboard and pad focus, so a player can
   * wait on it (Play Again while the next map counts down).
   */
  locked?: boolean;
  class?: string;
  children?: ComponentChildren;
}

export function Button({
  variant = 'blue',
  size = 'm',
  icon,
  round,
  pulse,
  disabled,
  locked,
  class: className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, round && 'btn--round', pulse && !disabled && !locked && 'btn--pulse', className];
  return (
    <button
      type="button"
      class={classes.filter(Boolean).join(' ')}
      disabled={disabled}
      aria-disabled={locked || undefined}
      onClick={locked ? undefined : onClick}
      {...rest}
    >
      <span class="btn__face">
        {icon && <Icon name={icon} class="btn__icon" />}
        {children !== undefined && <span class="btn__label">{children}</span>}
      </span>
    </button>
  );
}
