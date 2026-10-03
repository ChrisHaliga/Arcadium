/** Player identity and per-game loadouts. */
import { computed, type Signal } from '@preact/signals';
import type { GameModule } from '../shared/game';
import { cleanName } from '../shared/names';
import type { CosmeticKind, CosmeticsService, Loadout, ProfileService } from '../shared/services';
import type { ProfileData } from './save';

export function createProfile(
  profile: Signal<ProfileData>,
  playerId: string,
  cosmetics: CosmeticsService,
  games: readonly GameModule[],
): ProfileService {
  /** A game with no default loadout wears the first catalog item of each kind ('' when it has none). */
  const defaultFor = (gameId: string): Loadout => {
    const configured = games.find((game) => game.id === gameId)?.defaultLoadout;
    if (configured) return configured;
    const first = (kind: CosmeticKind) =>
      cosmetics.catalog.find((def) => def.gameId === gameId && def.kind === kind)?.id ?? '';
    return { skin: first('skin'), trail: first('trail'), capture: first('capture'), kill: first('kill') };
  };

  const wearable = (gameId: string, kind: CosmeticKind, id: string): boolean => {
    const def = cosmetics.get(id);
    return def !== undefined && def.gameId === gameId && def.kind === kind && cosmetics.isOwned(id);
  };

  // Reads signals, so a component that renders a loadout re-renders when it changes.
  const loadout = (gameId: string): Loadout => {
    const fallback = defaultFor(gameId);
    const saved = profile.value.loadouts[gameId];
    if (!saved) return fallback;
    const pick = (kind: CosmeticKind) => (wearable(gameId, kind, saved[kind]) ? saved[kind] : fallback[kind]);
    return { skin: pick('skin'), trail: pick('trail'), capture: pick('capture'), kill: pick('kill') };
  };

  return {
    name: computed(() => profile.value.name),
    color: computed(() => profile.value.color),
    playerId,
    loadout,
    setName(name) {
      const cleaned = cleanName(name);
      if (cleaned && cleaned !== profile.value.name) profile.value = { ...profile.value, name: cleaned };
    },
    setColor(color) {
      if (Number.isInteger(color) && color >= 0 && color !== profile.value.color) profile.value = { ...profile.value, color };
    },
    equip(gameId, kind, id) {
      if (!wearable(gameId, kind, id)) return;
      const next = { ...loadout(gameId), [kind]: id };
      profile.value = { ...profile.value, loadouts: { ...profile.value.loadouts, [gameId]: next } };
    },
  };
}
