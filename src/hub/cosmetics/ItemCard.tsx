/** A cosmetic in a rarity frame: live preview, name, kind, and a footer slot (price, owned, equipped). */
import type { ComponentChildren, JSX } from 'preact';
import type { CosmeticDef } from '../../shared/services';
import { Icon } from '../../shared/ui/kit';
import { cx } from '../ui/format';
import { CosmeticPreview } from './CosmeticPreview';
import { KIND_INFO, RARITY_LABEL } from './labels';
import './cosmetics.css';

interface ItemCardProps {
  def: CosmeticDef;
  /** Not owned: preview dimmed behind a lock. */
  locked?: boolean;
  /** Highlighted, e.g. currently equipped. */
  active?: boolean;
  /** Corner ribbon, e.g. "Owned" or "Equipped". */
  tag?: string;
  footer?: ComponentChildren;
  size?: 's' | 'm' | 'l';
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  class?: string;
}

export function ItemCard({ def, locked, active, tag, footer, size = 'm', onClick, class: className }: ItemCardProps) {
  const body = (
    <>
      <span class="item-card__rarity">{RARITY_LABEL[def.rarity]}</span>
      {tag && <span class="item-card__tag">{tag}</span>}
      <span class="item-card__art">
        <CosmeticPreview def={def} />
        {locked && (
          <span class="item-card__lock">
            <Icon name="lock" />
          </span>
        )}
      </span>
      <span class="item-card__name">{def.name}</span>
      <span class="item-card__kind">
        <Icon name={KIND_INFO[def.kind].icon} />
        {KIND_INFO[def.kind].label}
      </span>
      {footer && <span class="item-card__footer">{footer}</span>}
    </>
  );
  const classes = cx(
    'item-card',
    `item-card--${size}`,
    `rarity--${def.rarity}`,
    locked && 'is-locked',
    active && 'is-active',
    className,
  );
  return onClick ? (
    <button
      type="button"
      class={classes}
      onClick={onClick}
      aria-label={`${def.name}, ${RARITY_LABEL[def.rarity]} ${KIND_INFO[def.kind].label}`}
    >
      {body}
    </button>
  ) : (
    <div class={classes}>{body}</div>
  );
}
