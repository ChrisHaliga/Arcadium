/** Shop: today's rotation of cosmetics and the mystery chests. */
import type { ChestInfo, ShopItem } from '../../../meta';
import { Button, Icon } from '../../../shared/ui/kit';
import { useHub } from '../../context';
import { ItemCard } from '../../cosmetics/ItemCard';
import { ChestArt } from '../../ui/ChestArt';
import { CoinAmount } from '../../ui/Coin';
import { Countdown } from '../../ui/Countdown';
import { cx } from '../../ui/format';
import { openHeldChest } from '../../overlays/chestFlow';
import '../page.css';
import './shop.css';

export function Shop() {
  const { meta } = useHub();
  const items = meta.shop.items.value;
  const held = meta.chests.held.value;

  return (
    <div class="page scroll-y">
      <div class="page__inner">
        <header class="page__header">
          <h1 class="page__title headline">Shop</h1>
        </header>

        <section class="section">
          <div class="section__head">
            <h2 class="section__title headline">
              <Icon name="sparkle" /> Daily deals
            </h2>
            <Countdown until={meta.shop.refreshesAt.value} prefix="New in" />
          </div>
          {items.length > 0 ? (
            <div class="shop-grid">
              {items.map((item) => (
                <ShopCard key={item.def.id} item={item} />
              ))}
            </div>
          ) : (
            <p class="shop-empty panel">You own every item there is. Legend.</p>
          )}
        </section>

        <section class="section">
          <div class="section__head">
            <h2 class="section__title headline">
              <Icon name="chest" /> Mystery chests
            </h2>
          </div>
          <div class="chest-row">
            {meta.chests.types.map((info) => (
              <ChestCard key={info.type} info={info} held={held[info.type]} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ShopCard({ item }: { item: ShopItem }) {
  const { meta, store, toasts } = useHub();
  const affordable = meta.services.wallet.coins.value >= item.price;
  return (
    <ItemCard
      def={item.def}
      tag={item.owned ? 'Owned' : undefined}
      onClick={() => {
        if (item.owned) toasts.show(`${item.def.name} is already in your locker`, 'info');
        else store.open({ kind: 'buyItem', itemId: item.def.id });
      }}
      footer={
        item.owned ? (
          <span class="owned-tag">
            <Icon name="check" /> Owned
          </span>
        ) : (
          <span class={cx('price-tag', !affordable && 'price-tag--short')}>
            <CoinAmount amount={item.price} />
          </span>
        )
      }
    />
  );
}

function ChestCard({ info, held }: { info: ChestInfo; held: number }) {
  const hub = useHub();
  const { store } = hub;
  return (
    <div class={cx('chest-card', `chest-card--${info.type}`)}>
      <button
        type="button"
        class="chest-card__odds"
        aria-label={`${info.name} drop odds`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          store.open({ kind: 'odds', chest: info.type, anchor: { left: r.left, top: r.top, width: r.width, height: r.height } });
        }}
      >
        <Icon name="info" />
      </button>
      {held > 0 && <span class="chest-card__held">×{held}</span>}
      <span class="chest-card__glow" />
      <ChestArt type={info.type} class="chest-card__art" />
      <span class="chest-card__name">{info.name}</span>
      {held > 0 ? (
        <Button variant="green" size="s" pulse data-sfx="none" onClick={() => openHeldChest(hub, info.type)}>
          Open free
        </Button>
      ) : (
        <Button variant="gold" size="s" onClick={() => store.open({ kind: 'buyChest', chest: info.type })}>
          <CoinAmount amount={info.price} />
        </Button>
      )}
    </div>
  );
}
