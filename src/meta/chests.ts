/** Mystery chests: bought with coins, or earned (daily day 7, level-ups) and held until opened. */
import { batch, type ReadonlySignal, type Signal } from '@preact/signals';
import type { CosmeticDef, Rarity, WalletService } from '../shared/services';
import { CHESTS, RARITIES, SHOP, type ChestType } from './config';
import type { MetaCosmetics } from './cosmetics';
import { pickWeighted } from './random';
import type { ChestCounts } from './save';
import type { StatsRecorder } from './stats';

export interface ChestInfo {
  type: ChestType;
  name: string;
  price: number;
  /** Percent chance per rarity, for the odds display. */
  odds: Readonly<Record<Rarity, number>>;
}

export interface ChestResult {
  type: ChestType;
  item: CosmeticDef;
  rarity: Rarity;
  /** Already owned: the item is not granted again and `refund` coins are paid instead. */
  duplicate: boolean;
  refund: number;
}

export interface Chests {
  readonly types: readonly ChestInfo[];
  /** Earned chests waiting to be opened. */
  readonly held: ReadonlySignal<Readonly<Record<ChestType, number>>>;
  /** Pays the price and opens the chest; null (nothing charged) when coins are short or nothing can drop. */
  buy(type: ChestType): ChestResult | null;
  /** Opens one held chest; null when none of that type is held or nothing can drop. */
  openFree(type: ChestType): ChestResult | null;
}

export interface MetaChests extends Chests {
  /** Adds an earned chest to the held stock. */
  give(type: ChestType): void;
}

export function createChests(
  held: Signal<ChestCounts>,
  wallet: WalletService,
  cosmetics: MetaCosmetics,
  stats: StatsRecorder,
  random: () => number,
): MetaChests {
  const types: ChestInfo[] = (Object.keys(CHESTS) as ChestType[]).map((type) => ({ type, ...CHESTS[type] }));

  const pools = new Map<Rarity, CosmeticDef[]>();
  for (const def of cosmetics.droppable) pools.set(def.rarity, [...(pools.get(def.rarity) ?? []), def]);

  /** A rarity no game offers falls back to the nearest commoner one first, so gaps never inflate drops. */
  const resolve = (rolled: Rarity): Rarity | undefined => {
    const i = RARITIES.indexOf(rolled);
    const order = [...RARITIES.slice(0, i + 1).reverse(), ...RARITIES.slice(i + 1)];
    return order.find((rarity) => (pools.get(rarity)?.length ?? 0) > 0);
  };

  const open = (type: ChestType): ChestResult | null => {
    const rarity = resolve(pickWeighted(CHESTS[type].odds, random));
    const pool = rarity && pools.get(rarity);
    if (!rarity || !pool) return null;
    // Odds are per rarity, so steering toward unowned items within it keeps the shown odds
    // honest while making duplicates (and their refund) the exception.
    const unowned = pool.filter((def) => !cosmetics.isOwned(def.id));
    const duplicate = unowned.length === 0;
    const choices = duplicate ? pool : unowned;
    const item = choices[Math.floor(random() * choices.length)];
    const refund = duplicate ? Math.round(SHOP.prices[rarity] * SHOP.duplicateRefund) : 0;
    batch(() => {
      if (duplicate) wallet.add(refund, 'chest-duplicate');
      else cosmetics.grant(item.id);
      stats.add('chestsOpened', 1);
    });
    return { type, item, rarity, duplicate, refund };
  };

  return {
    types,
    held,
    give(type) {
      held.value = { ...held.value, [type]: held.value[type] + 1 };
    },
    buy(type) {
      if (cosmetics.droppable.length === 0) return null;
      return batch(() => (wallet.spend(CHESTS[type].price, `chest:${type}`) ? open(type) : null));
    },
    openFree(type) {
      if (held.value[type] <= 0) return null;
      return batch(() => {
        const result = open(type);
        if (result) held.value = { ...held.value, [type]: held.value[type] - 1 };
        return result;
      });
    },
  };
}
