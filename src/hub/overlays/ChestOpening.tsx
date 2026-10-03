/**
 * The chest opening sequence: the chest drops in, shakes harder three times while its
 * glow climbs the rarity ladder up to what's inside, bursts open, and the item card is
 * revealed. Tapping (or Back) skips straight to the burst.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChestResult } from '../../meta';
import { RARITIES } from '../../meta/config';
import { Button } from '../../shared/ui/kit';
import { useHub } from '../context';
import { ItemCard } from '../cosmetics/ItemCard';
import { KIND_INFO, RARITY_COLORS, RARITY_LABEL } from '../cosmetics/labels';
import { reducedMotion, replayClass } from '../fx/motion';
import type { Overlay } from '../store';
import { ChestArt } from '../ui/ChestArt';
import { CoinAmount } from '../ui/Coin';
import { cx } from '../ui/format';
import { focusFirst, usingKeys } from '../../shared/ui/nav';
import { openHeldChest } from './chestFlow';
import './chest-opening.css';

type Stage = 'drop' | 'shake' | 'burst' | 'reveal';

const SHAKES = 3;
const DROP_MS = 750;
const SHAKE_MS = 520;
const BURST_MS = 480;
const REFUND_DELAY_MS = 650;
const SHAKE_HAPTICS = ['light', 'medium', 'heavy'] as const;

export function ChestOpening({ overlay, result }: { overlay: Overlay; result: ChestResult }) {
  const hub = useHub();
  const { meta, store, audio, haptics, particles, coins, toasts } = hub;
  const [stage, setStage] = useState<Stage>('drop');
  const [shakes, setShakes] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const chest = useRef<HTMLDivElement>(null);
  const refund = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<Stage>('drop');
  const timers = useRef<number[]>([]);
  const refundHeld = useRef(result.duplicate ? result.refund : 0);
  const finalTier = RARITIES.indexOf(result.rarity);
  // The glow climbs one rarity per shake and lands on the real one at the last shake.
  const tier = stage === 'drop' ? -1 : stage === 'shake' ? Math.floor((shakes / SHAKES) * finalTier) : finalTier;
  const tierColor = tier < 0 ? '#ffffff' : RARITY_COLORS[RARITIES[tier]][0];

  const go = (next: Stage) => {
    stageRef.current = next;
    setStage(next);
  };

  const clearTimers = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  };

  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, reducedMotion.peek() ? Math.min(ms, 120) : ms));
  };

  const centre = () => {
    const r = chest.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
  };

  const reveal = () => {
    go('reveal');
    audio.play(result.rarity === 'legendary' ? 'jackpot' : 'reward');
    haptics.notify('success');
    if (result.rarity === 'legendary' || result.rarity === 'epic') particles.rain(RARITY_COLORS[result.rarity], 140);
    after(REFUND_DELAY_MS, () => {
      if (refundHeld.current === 0) return;
      coins.fly(refundHeld.current, refund.current);
      refundHeld.current = 0;
    });
  };

  const burst = () => {
    clearTimers();
    go('burst');
    audio.play('chestOpen');
    haptics.impact('heavy');
    const { x, y } = centre();
    const colors = RARITY_COLORS[result.rarity];
    particles.burst(x, y, { colors, kind: 'sparks', count: 40 + finalTier * 25, speed: 900 });
    particles.burst(x, y, { colors, kind: 'confetti', count: 40 + finalTier * 20, speed: 750 });
    if (meta.services.settings.screenShake.peek()) replayClass(root.current, 'is-quaking');
    after(BURST_MS, reveal);
  };

  const shakeOnce = (count: number) => {
    go('shake');
    setShakes(count);
    audio.play('chestShake', { pitch: 1 + (count - 1) * 0.16 });
    haptics.impact(SHAKE_HAPTICS[count - 1]);
    chest.current?.style.setProperty('--amp', `${4 + count * 4}deg`);
    replayClass(chest.current, 'is-rattling');
  };

  const skip = () => {
    if (stageRef.current === 'drop' || stageRef.current === 'shake') burst();
  };

  const close = () => store.close(overlay);

  useEffect(() => {
    audio.play('whoosh', { pitch: 0.8 });
    for (let i = 1; i <= SHAKES; i++) after(DROP_MS + (i - 1) * SHAKE_MS, () => shakeOnce(i));
    after(DROP_MS + SHAKES * SHAKE_MS, burst);
    const release = store.interceptBack(() => (stageRef.current === 'reveal' ? close() : skip()));
    return () => {
      release();
      clearTimers();
      // Closed before the refund flew: hand the coins straight to the counter.
      if (refundHeld.current > 0) coins.release(refundHeld.current);
    };
  }, []);

  useEffect(() => {
    if (stage === 'reveal' && root.current && usingKeys()) focusFirst(root.current);
  }, [stage]);

  const heldMore = meta.chests.held.value[result.type] > 0;
  const { item } = result;

  return (
    <div
      ref={root}
      class={cx('chest-open', `stage-${stage}`, `rarity--${result.rarity}`)}
      style={{ '--tier': tierColor }}
      role="dialog"
      aria-modal="true"
      aria-label="Chest opening"
      data-nav-scope
      onClick={stage === 'reveal' ? undefined : skip}
    >
      <div class="chest-open__rays" />
      <div class="chest-open__flash" />

      {stage !== 'reveal' && (
        <div class="chest-open__stage">
          <div class="chest-open__glow" style={{ transform: `scale(${0.6 + shakes * 0.25})` }} />
          <div class="chest-open__chest">
            <div class="chest-open__rattle" ref={chest}>
              <ChestArt type={result.type} open={stage === 'burst'} />
            </div>
          </div>
          <div class="chest-open__hint">Tap to open</div>
        </div>
      )}

      {stage === 'reveal' && (
        <div class="chest-open__reveal">
          <div class="chest-open__headline headline">
            {result.duplicate ? 'Duplicate!' : `${RARITY_LABEL[result.rarity]}!`}
          </div>
          <ItemCard def={item} size="l" tag={result.duplicate ? undefined : 'New'} class="chest-open__card" />
          {result.duplicate ? (
            <span class="chest-open__refund" ref={refund}>
              Already owned — converted to <CoinAmount amount={result.refund} />
            </span>
          ) : (
            <span class="chest-open__sub">New {KIND_INFO[item.kind].label} unlocked!</span>
          )}
          <div class="chest-open__actions">
            {!result.duplicate && (
              <Button
                variant="green"
                icon="locker"
                onClick={() => {
                  meta.services.profile.equip(item.gameId, item.kind, item.id);
                  toasts.show(`${item.name} equipped`, 'success');
                  close();
                }}
              >
                Equip
              </Button>
            )}
            {heldMore && (
              <Button variant="purple" icon="chest" data-sfx="none" onClick={() => openHeldChest(hub, result.type, overlay)}>
                Open another
              </Button>
            )}
            <Button variant="gold" data-autofocus onClick={close}>
              Collect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
