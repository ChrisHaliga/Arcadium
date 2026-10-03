/**
 * Daily shop rotation. The rotation is drawn once per local day from what the player
 * doesn't own yet and then stored, so buying an item marks it owned instead of
 * reshuffling the rest of the day's offers.
 */
import { batch, computed, type ReadonlySignal, type Signal } from '@preact/signals';
import type { CosmeticDef, WalletService } from '../shared/services';
import { SHOP } from './config';
import type { MetaCosmetics } from './cosmetics';
import { hashString, seededRandom, shuffled } from './random';
import type { ShopData } from './save';
import type { StatsRecorder } from './stats';
import { dayEnd, type Clock } from './time';

export interface ShopItem {
  def: CosmeticDef;
  price: number;
  /** Bought today (or won from a chest since the rotation was drawn). */
  owned: boolean;
}

export interface Shop {
  /** Today's offers, including ones already bought (shown as owned). */
  readonly items: ReadonlySignal<readonly ShopItem[]>;
  /** Local midnight when the rotation changes (epoch ms). */
  readonly refreshesAt: ReadonlySignal<number>;
  /** Milliseconds until the rotation changes, for the countdown. */
  msUntilRefresh(): number;
  /** Buys an item from today's rotation; false when it isn't on sale, already owned, or coins are short. */
  buy(id: string): boolean;
}

export function createShop(
  shop: Signal<ShopData>,
  clock: Clock,
  wallet: WalletService,
  cosmetics: MetaCosmetics,
  stats: StatsRecorder,
): Shop {
  // Sorted so the seeded draw doesn't depend on the order games are registered in.
  const stock = [...cosmetics.droppable].sort((a, b) => (a.id < b.id ? -1 : 1));

  const rollover = () => {
    const day = clock.day.value;
    if (shop.value.day === day) return;
    const unowned = stock.filter((def) => !cosmetics.isOwned(def.id));
    const items = shuffled(unowned, seededRandom(hashString(`shop:${day}`)))
      .slice(0, SHOP.rotationSize)
      .map((def) => def.id);
    shop.value = { ...shop.value, day, items };
  };
  rollover();
  clock.onRollover(rollover);

  const items = computed(() =>
    shop.value.items.flatMap((id): ShopItem[] => {
      const def = cosmetics.get(id);
      return def ? [{ def, price: SHOP.prices[def.rarity], owned: cosmetics.owned.value.has(id) }] : [];
    }),
  );
  const refreshesAt = computed(() => dayEnd(shop.value.day));

  return {
    items,
    refreshesAt,
    msUntilRefresh: () => Math.max(0, refreshesAt.value - clock.now()),
    buy(id) {
      clock.sync();
      const def = cosmetics.get(id);
      if (!def || !shop.value.items.includes(id) || cosmetics.isOwned(id)) return false;
      return batch(() => {
        if (!wallet.spend(SHOP.prices[def.rarity], `shop:${id}`)) return false;
        cosmetics.grant(id);
        shop.value = { ...shop.value, purchases: [...shop.value.purchases, id] };
        stats.add('itemsBought', 1);
        return true;
      });
    },
  };
}
