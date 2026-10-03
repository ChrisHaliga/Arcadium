/** A small bubble next to a chest's info button showing its drop odds. */
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ChestType } from '../../meta';
import { focusFirst, usingKeys } from '../../shared/ui/nav';
import { useHub } from '../context';
import type { AnchorRect, Overlay } from '../store';
import { OddsList } from './Purchase';
import './popover.css';

const MARGIN = 12;
const GAP = 10;

export function OddsPopover({ overlay, chest, anchor }: { overlay: Overlay; chest: ChestType; anchor: AnchorRect }) {
  const { meta, store } = useHub();
  const info = meta.chests.types.find((c) => c.type === chest);
  const bubble = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; arrow: number; below: boolean } | null>(null);

  // Measure first, then place: above the anchor if it fits, otherwise below, clamped to the screen.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const centre = anchor.left + anchor.width / 2;
    const left = Math.max(MARGIN, Math.min(innerWidth - w - MARGIN, centre - w / 2));
    const below = anchor.top - h - GAP < MARGIN;
    const preferred = below ? anchor.top + anchor.height + GAP : anchor.top - h - GAP;
    // Short screens may fit it neither above nor below; keep it on screen even if it covers the anchor.
    const top = Math.max(MARGIN, Math.min(innerHeight - h - MARGIN, preferred));
    setPlace({ left, top, arrow: centre - left, below });
    if (usingKeys()) focusFirst(el);
  }, [anchor]);

  if (!info) return null;
  return (
    <div class="popover-layer" data-nav-scope>
      <div class="popover-layer__catch" onClick={() => store.close(overlay)} />
      <div
        ref={bubble}
        class={place?.below ? 'popover is-below' : 'popover'}
        role="dialog"
        aria-label={`${info.name} odds`}
        style={
          place
            ? { left: `${place.left}px`, top: `${place.top}px`, '--arrow': `${place.arrow}px` }
            : { visibility: 'hidden' }
        }
      >
        <div class="popover__title">{info.name} odds</div>
        <OddsList info={info} />
        <button type="button" class="popover__close" onClick={() => store.close(overlay)}>
          Got it
        </button>
      </div>
    </div>
  );
}
