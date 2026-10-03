/** The player's head: a glossy block in their colour with a pair of eyes, like the heads in-game. */
import type { PlayerColor } from '../../games/registry';
import { cx } from './format';
import './avatar.css';

export function Avatar({ color, class: className }: { color: PlayerColor; class?: string }) {
  return (
    <span
      class={cx('avatar', className)}
      style={{ '--c': color.base, '--c-light': color.light, '--c-dark': color.dark }}
      aria-hidden="true"
    >
      <span class="avatar__eye" />
      <span class="avatar__eye" />
    </span>
  );
}
