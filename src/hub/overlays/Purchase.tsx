/** Purchase confirmations: a cosmetic from the daily rotation, or a mystery chest. */
import { useState } from 'preact/hooks';
import type { ChestInfo, ChestType } from '../../meta';
import { RARITIES } from '../../meta/config';
import { Button } from '../../shared/ui/kit';
import { useHub } from '../context';
import { ItemCard } from '../cosmetics/ItemCard';
import { KIND_INFO, RARITY_COLORS, RARITY_LABEL } from '../cosmetics/labels';
import type { Overlay } from '../store';
import { ChestArt } from '../ui/ChestArt';
import { CoinAmount } from '../ui/Coin';
import { Modal } from '../ui/Modal';
import { buyChest } from './chestFlow';
import './purchase.css';

export function BuyItem({ overlay, itemId }: { overlay: Overlay; itemId: string }) {
  const { meta, store, feedback, particles, toasts } = useHub();
  const item = meta.shop.items.value.find((i) => i.def.id === itemId);
  const [bought, setBought] = useState(false);
  const close = () => store.close(overlay);
  if (!item) return null;
  const { def, price } = item;

  const buy = (e: MouseEvent) => {
    if (meta.services.wallet.coins.value < price) {
      feedback.notEnoughCoins();
      return;
    }
    if (!meta.shop.buy(def.id)) {
      feedback.error('This deal is no longer available');
      return;
    }
    feedback.success();
    const r = (e.currentTarget as HTMLElement).closest('.modal__panel')?.getBoundingClientRect();
    if (r) {
      particles.burst(r.left + r.width / 2, r.top + r.height * 0.35, {
        colors: RARITY_COLORS[def.rarity],
        count: 70,
        speed: 800,
      });
    }
    setBought(true);
  };

  return (
    <Modal title={bought ? 'Unlocked!' : 'Buy item'} tone={bought ? 'green' : 'gold'} size="s" onClose={close}>
      <div class="purchase">
        <ItemCard def={def} size="l" tag={bought ? 'New' : undefined} class={bought ? 'purchase__won' : undefined} />
        <div class="purchase__side">
          {bought ? (
            <div class="purchase__actions">
              <Button variant="slate" onClick={close}>
                Nice!
              </Button>
              <Button
                variant="green"
                icon="locker"
                data-autofocus
                onClick={() => {
                  meta.services.profile.equip(def.gameId, def.kind, def.id);
                  toasts.show(`${def.name} equipped`, 'success');
                  close();
                }}
              >
                Equip now
              </Button>
            </div>
          ) : (
            <>
              <p class="purchase__note">
                {RARITY_LABEL[def.rarity]} {KIND_INFO[def.kind].label} — yours to keep forever.
              </p>
              <div class="purchase__actions">
                <Button variant="slate" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="gold"
                  size="l"
                  data-sfx="none"
                  data-autofocus
                  aria-label={`Buy for ${price} coins`}
                  onClick={buy}
                >
                  <CoinAmount amount={price} />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function BuyChest({ overlay, chest }: { overlay: Overlay; chest: ChestType }) {
  const hub = useHub();
  const info = hub.meta.chests.types.find((c) => c.type === chest);
  if (!info) return null;
  return (
    <Modal title={info.name} tone="purple" size="s" onClose={() => hub.store.close(overlay)}>
      <div class="purchase">
        <div class="purchase__chest">
          <span class="purchase__rays" />
          <ChestArt type={chest} />
        </div>
        <div class="purchase__side">
          <p class="purchase__note">One random item. Duplicates turn into coins.</p>
          <OddsList info={info} />
          <div class="purchase__actions">
            <Button variant="slate" onClick={() => hub.store.close(overlay)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="l"
              data-sfx="none"
              data-autofocus
              aria-label={`Open for ${info.price} coins`}
              onClick={() => buyChest(hub, chest, overlay)}
            >
              Open <CoinAmount amount={info.price} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Drop chance per rarity, rarest last, skipping rarities this chest can't drop. */
export function OddsList({ info }: { info: ChestInfo }) {
  return (
    <ul class="odds">
      {RARITIES.filter((r) => info.odds[r] > 0).map((rarity) => (
        <li key={rarity} class={`odds__row rarity--${rarity}`}>
          <span class="odds__dot" />
          <span class="odds__name">{RARITY_LABEL[rarity]}</span>
          <span class="odds__value">{info.odds[rarity]}%</span>
        </li>
      ))}
    </ul>
  );
}
