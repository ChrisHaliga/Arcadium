/** Renders the overlay stack, bottom to top. */
import { useHub } from '../context';
import type { Overlay } from '../store';
import { ChestOpening } from './ChestOpening';
import { DailyRewards } from './DailyRewards';
import { LevelUp } from './LevelUp';
import { OddsPopover } from './OddsPopover';
import { BuyChest, BuyItem } from './Purchase';
import { Settings } from './Settings';

/** Stable keys per overlay object, so replacing one overlay with another remounts it. */
const keys = new WeakMap<Overlay, number>();
let nextKey = 1;

function keyOf(overlay: Overlay): number {
  let key = keys.get(overlay);
  if (key === undefined) {
    key = nextKey++;
    keys.set(overlay, key);
  }
  return key;
}

export function Overlays() {
  const { store } = useHub();
  return (
    <>
      {store.overlays.value.map((overlay) => (
        <OverlayView key={keyOf(overlay)} overlay={overlay} />
      ))}
    </>
  );
}

function OverlayView({ overlay }: { overlay: Overlay }) {
  switch (overlay.kind) {
    case 'daily':
      return <DailyRewards overlay={overlay} />;
    case 'settings':
      return <Settings overlay={overlay} />;
    case 'buyItem':
      return <BuyItem overlay={overlay} itemId={overlay.itemId} />;
    case 'buyChest':
      return <BuyChest overlay={overlay} chest={overlay.chest} />;
    case 'odds':
      return <OddsPopover overlay={overlay} chest={overlay.chest} anchor={overlay.anchor} />;
    case 'chest':
      return <ChestOpening overlay={overlay} result={overlay.result} />;
    case 'levelUp':
      return <LevelUp overlay={overlay} levelUp={overlay.levelUp} />;
  }
}
