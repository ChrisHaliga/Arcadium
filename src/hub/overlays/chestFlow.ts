/**
 * Opening chests. Duplicate refunds are granted the instant a chest opens, so their coins
 * are held back from the wallet counter until the reveal shows them.
 */
import type { ChestResult, ChestType } from '../../meta';
import type { Hub } from '../context';
import type { Overlay } from '../store';

/** Pays for and opens a chest; `replacing` is the confirmation dialog the opening takes over from. */
export function buyChest(hub: Hub, type: ChestType, replacing?: Overlay): boolean {
  const { meta, coins, feedback } = hub;
  const price = meta.chests.types.find((c) => c.type === type)?.price ?? 0;
  if (meta.services.wallet.coins.value < price) {
    feedback.notEnoughCoins();
    return false;
  }
  const result = coins.withSource('later', () => meta.chests.buy(type));
  if (!result) {
    feedback.error('Nothing left to win in this chest');
    return false;
  }
  show(hub, result, replacing);
  return true;
}

export function openHeldChest(hub: Hub, type: ChestType, replacing?: Overlay): boolean {
  const result = hub.coins.withSource('later', () => hub.meta.chests.openFree(type));
  if (!result) {
    hub.feedback.error('No chest to open');
    return false;
  }
  show(hub, result, replacing);
  return true;
}

function show(hub: Hub, result: ChestResult, replacing: Overlay | undefined): void {
  const next: Overlay = { kind: 'chest', result };
  if (replacing) hub.store.replace(replacing, next);
  else hub.store.open(next);
}
