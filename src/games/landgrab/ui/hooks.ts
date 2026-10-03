/** Small hooks and formatters shared by the match overlays. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameUi } from './store';

const numberFormat = new Intl.NumberFormat('en-US');

export function formatNumber(n: number): string {
  return numberFormat.format(Math.round(n));
}

/** 0..1000 share as a percentage with one decimal, e.g. "12.4%". */
export function formatPermille(permille: number): string {
  return `${(Math.max(0, permille) / 10).toFixed(1)}%`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A number that rolls toward its target like a reel counter instead of jumping. Bigger
 * changes roll a little longer so they feel bigger, within [minMs, maxMs]. With `down`
 * 'snap', drops show at once: a counter of earnings only ever rolls up, so starting
 * over or paying never looks like coins draining away.
 */
export function useRolling(target: number, minMs = 300, maxMs = 1000, down: 'roll' | 'snap' = 'roll'): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target || (down === 'snap' && target < from) || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const duration = Math.min(maxMs, minMs + Math.log10(Math.abs(target - from) + 1) * 160);
    const start = performance.now();
    let frame = requestAnimationFrame(function roll(time) {
      const t = Math.min(1, (time - start) / duration);
      const value = from + (target - from) * (1 - (1 - t) ** 3);
      shownRef.current = t < 1 ? value : target;
      setShown(shownRef.current);
      if (t < 1) frame = requestAnimationFrame(roll);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, minMs, maxMs, down]);

  return shown;
}

/**
 * The match clock (GameUi.clock), refreshed every `intervalMs` while `active`, for
 * countdowns that follow the match: they hold still while it is frozen.
 */
export function useMatchClock(ui: GameUi, intervalMs: number, active = true): number {
  const ticking = active && !ui.frozen.value;
  const [now, setNow] = useState(() => ui.clock());
  useEffect(() => {
    if (!ticking) return;
    setNow(ui.clock());
    const timer = setInterval(() => setNow(ui.clock()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, ticking]);
  return now;
}

/** Restarts a CSS animation each time `key` changes by toggling a class for one frame. */
export function useBump(key: unknown): boolean {
  const [bumping, setBumping] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBumping(false);
    const frame = requestAnimationFrame(() => setBumping(true));
    const timer = setTimeout(() => setBumping(false), 260);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [key]);
  return bumping;
}
