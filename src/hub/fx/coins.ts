/**
 * Coins flying into the wallet pill. The wallet balance changes the moment a reward is
 * granted, but the pill only counts coins as they land, so the counter visibly fills up
 * with the flight instead of jumping ahead of it.
 */
import { signal, type ReadonlySignal } from '@preact/signals';
import type { CoinGain } from '../../meta';
import type { AudioService, HapticsService } from '../../shared/services';
import { reducedMotion } from './motion';

export interface Point {
  x: number;
  y: number;
}

/** Where a gain's coins fly from: an element, or 'later' when its UI will call fly() itself. */
export type CoinSource = Element | Point | 'later';

export interface CoinFx {
  /** Coins already in the wallet that the counter should not show yet. */
  readonly held: ReadonlySignal<number>;
  /** Counts landed coins, so the pill can bump on each one. */
  readonly landed: ReadonlySignal<number>;
  /** The coin icon in the wallet pill: the flight target and the sprite every flying coin copies. */
  setTarget(el: HTMLElement | null): void;
  target(): HTMLElement | null;
  /** The layer flying coins are added to. Returns a detach function. */
  attach(layer: HTMLElement): () => void;
  /** Hides `amount` from the counter until a fly() or release() hands it back. */
  hold(amount: number): void;
  /** Flies held coins from `from` (screen centre when null) and releases them as they land. */
  fly(amount: number, from: Element | Point | null): void;
  release(amount: number): void;
  /** Runs `action`, sending any coins it grants from `source`. */
  withSource<T>(source: CoinSource, action: () => T): T;
  /** Animates one wallet gain according to the current source. */
  receive(gain: CoinGain): void;
}

const MIN_SPRITES = 4;
const MAX_SPRITES = 14;
const STAGGER_MS = 55;
const FLIGHT_MS = 820;

export function createCoinFx(audio: AudioService, haptics: HapticsService): CoinFx {
  const held = signal(0);
  const landed = signal(0);
  let targetEl: HTMLElement | null = null;
  let layerEl: HTMLElement | null = null;
  let source: CoinSource | null = null;

  const release = (amount: number) => {
    held.value = Math.max(0, held.value - amount);
  };

  const land = (amount: number, index: number) => {
    release(amount);
    landed.value++;
    audio.play('coin', { pitch: 1 + index * 0.04 });
    haptics.impact('light');
  };

  const fly = (amount: number, from: Element | Point | null) => {
    const target = targetEl;
    const layer = layerEl;
    if (amount <= 0) return;
    if (!target || !layer || reducedMotion.value) {
      land(amount, 0);
      return;
    }
    const box = target.getBoundingClientRect();
    const end = { x: box.left, y: box.top };
    const origin = centreOf(from);
    const start = { x: origin.x - box.width / 2, y: origin.y - box.height / 2 };
    const count = Math.max(MIN_SPRITES, Math.min(MAX_SPRITES, Math.round(Math.log2(amount + 1) * 1.6)));
    const share = Math.floor(amount / count);
    for (let i = 0; i < count; i++) {
      const coins = i === count - 1 ? amount - share * (count - 1) : share;
      const sprite = target.cloneNode(true) as HTMLElement;
      // Only the look is copied: the pill's own classes would drag its bump animation along.
      sprite.className = 'coin-sprite';
      sprite.setAttribute('aria-hidden', 'true');
      sprite.style.cssText = `position:absolute;left:0;top:0;width:${box.width}px;height:${box.height}px;will-change:transform`;
      layer.append(sprite);
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 70;
      const scatter = { x: start.x + Math.cos(angle) * radius, y: start.y + Math.sin(angle) * radius };
      const animation = sprite.animate(
        [
          { transform: `translate(${start.x}px, ${start.y}px) scale(0.3)`, opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1)' },
          {
            transform: `translate(${scatter.x}px, ${scatter.y}px) scale(1.3)`,
            opacity: 1,
            offset: 0.3,
            easing: 'cubic-bezier(.6,0,.85,.5)',
          },
          { transform: `translate(${end.x}px, ${end.y}px) scale(0.9)`, opacity: 1 },
        ],
        { duration: FLIGHT_MS, delay: i * STAGGER_MS, fill: 'both' },
      );
      animation.onfinish = () => {
        sprite.remove();
        land(coins, i);
      };
      // A cancelled flight (layer torn down) must still hand its coins back to the counter.
      animation.oncancel = () => {
        sprite.remove();
        release(coins);
      };
    }
  };

  return {
    held,
    landed,
    setTarget(el) {
      targetEl = el;
    },
    target: () => targetEl,
    attach(layer) {
      layerEl = layer;
      return () => {
        if (layerEl === layer) layerEl = null;
        for (const animation of layer.getAnimations({ subtree: true })) animation.cancel();
      };
    },
    hold(amount) {
      if (amount > 0) held.value += amount;
    },
    fly,
    release,
    withSource(next, action) {
      const previous = source;
      source = next;
      try {
        return action();
      } finally {
        source = previous;
      }
    },
    receive(gain) {
      held.value += gain.amount;
      if (source !== 'later') fly(gain.amount, source);
    },
  };
}

function centreOf(from: Element | Point | null): Point {
  if (!from) return { x: innerWidth / 2, y: innerHeight / 2 };
  if (!(from instanceof Element)) return from;
  const r = from.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
