/** A requestAnimationFrame loop, optionally capped below the display rate (the attract match runs at ~30 fps). */

export interface FrameLoop {
  stop(): void;
}

/** rAF already stops while the page is hidden, so a loop never runs in the background. */
export function startFrameLoop(onFrame: (nowMs: number) => void, maxFps = 0): FrameLoop {
  // A little slack, so a 60 Hz display lands on every other frame for a 30 fps cap rather than drifting.
  const minGapMs = maxFps > 0 ? 1000 / maxFps - 3 : 0;
  let last = Number.NEGATIVE_INFINITY;
  let frame = 0;
  let running = true;
  const tick = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    if (now - last < minGapMs) return;
    last = now;
    onFrame(now);
  };
  frame = requestAnimationFrame(tick);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
  };
}
