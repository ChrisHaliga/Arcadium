/** A number that rolls toward its target like a slot-machine counter instead of jumping. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { reducedMotion } from './motion';

const MIN_MS = 350;
const MAX_MS = 1100;

export function useRollingNumber(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target || reducedMotion.peek()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    // Bigger changes roll a little longer so they feel bigger, within limits.
    const duration = Math.min(MAX_MS, MIN_MS + Math.log10(Math.abs(target - from) + 1) * 180);
    const start = performance.now();
    let frame = requestAnimationFrame(function roll(time) {
      const t = Math.min(1, (time - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const value = Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(roll);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
