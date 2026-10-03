/**
 * Fixed-rate loop for driving rooms. Deadlines advance by exactly one interval per tick,
 * so timer lateness never accumulates into a slower game; after a stall it catches up a
 * few ticks at once and drops the rest rather than fast-forwarding through a burst.
 */

export interface Ticker {
  stop(): void;
}

/**
 * Whether the app is out of sight. Passed in rather than read from the page, because the
 * match server runs this loop too and has no page.
 */
export interface Visibility {
  readonly hidden: boolean;
  /** Calls `cb` whenever `hidden` may have changed; returns the unsubscribe. */
  onChange(cb: () => void): () => void;
}

export interface TickerOptions {
  /** Most ticks run back to back after a late wake-up. */
  maxCatchUp?: number;
  /** Stop while this is hidden (offline play pauses with the tab). */
  pauseWhenHidden?: Visibility;
}

const DEFAULT_MAX_CATCH_UP = 3;

export function startTicker(intervalMs: number, onTick: () => void, opts: TickerOptions = {}): Ticker {
  const maxCatchUp = opts.maxCatchUp ?? DEFAULT_MAX_CATCH_UP;
  const visibility = opts.pauseWhenHidden;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let next = performance.now() + intervalMs;
  let stopped = false;

  const schedule = () => {
    timer = setTimeout(run, Math.max(0, next - performance.now()));
  };
  const run = () => {
    timer = null;
    for (let ran = 0; ran < maxCatchUp && next <= performance.now(); ran++) {
      next += intervalMs;
      onTick();
    }
    const now = performance.now();
    if (next <= now) next = now + intervalMs;
    if (!stopped) schedule();
  };
  const onVisibility = () => {
    if (!visibility || stopped) return;
    if (visibility.hidden) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    } else if (timer === null) {
      next = performance.now() + intervalMs;
      schedule();
    }
  };

  const unwatch = visibility?.onChange(onVisibility);
  if (!visibility?.hidden) schedule();
  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      unwatch?.();
    },
  };
}
