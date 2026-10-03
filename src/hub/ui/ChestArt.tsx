/** A treasure chest drawn in CSS; size it with font-size (the chest is 4em wide). */
import type { ChestType } from '../../meta';
import { cx } from './format';
import './chest.css';

export function ChestArt({ type, open, class: className }: { type: ChestType; open?: boolean; class?: string }) {
  return (
    <span class={cx('chest', `chest--${type}`, open && 'is-open', className)} aria-hidden="true">
      <span class="chest__lid">
        <span class="chest__band" />
      </span>
      <span class="chest__body">
        <span class="chest__band" />
        <span class="chest__lock" />
      </span>
    </span>
  );
}
