/** Cosmetic catalog (every game's contributions) and what the player owns. */
import type { Signal } from '@preact/signals';
import type { GameModule } from '../shared/game';
import type { CosmeticDef, CosmeticsService } from '../shared/services';

export interface MetaCosmetics extends CosmeticsService {
  /** What the shop and chests can offer: catalogs of playable games, minus the free starter items. */
  readonly droppable: readonly CosmeticDef[];
}

export function createCosmetics(owned: Signal<ReadonlySet<string>>, games: readonly GameModule[]): MetaCosmetics {
  // Each game's default loadout is free and owned from the start.
  const starters = new Set(games.flatMap(({ defaultLoadout: l }) => (l ? [l.skin, l.trail, l.capture, l.kill] : [])));
  const byId = new Map<string, CosmeticDef>();
  for (const game of games) for (const def of game.cosmetics) if (!byId.has(def.id)) byId.set(def.id, def);
  const catalog = [...byId.values()];
  const playable = new Set(games.filter((g) => g.available).map((g) => g.id));
  const droppable = catalog.filter((def) => playable.has(def.gameId) && !starters.has(def.id));

  // Runs on every start so starters of a game added in an app update are owned too.
  const missingStarters = [...starters].filter((id) => byId.has(id) && !owned.value.has(id));
  if (missingStarters.length > 0) owned.value = new Set([...owned.value, ...missingStarters]);

  return {
    catalog,
    droppable,
    owned,
    get: (id) => byId.get(id),
    isOwned: (id) => owned.value.has(id),
    grant(id) {
      if (!byId.has(id) || owned.value.has(id)) return;
      owned.value = new Set([...owned.value, id]);
    },
  };
}
