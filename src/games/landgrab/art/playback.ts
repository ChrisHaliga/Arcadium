/**
 * Plays art scenes: one shared animation loop for every scene on the page (the card and
 * a shop full of previews), at ~30 fps, advancing only scenes whose canvas is on screen.
 * requestAnimationFrame stops by itself while the page is hidden. A scene is built the
 * first time its canvas comes into view, a few per frame, so opening a page of previews
 * never stalls a frame and previews scrolled out of sight cost nothing. With reduced
 * motion a scene is shown as a single still.
 */
import type { Disposable } from '../../../shared/game';
import type { Scene } from './scene';

interface Entry {
  build: () => Scene;
  scene: Scene | null;
  visible: boolean;
  /** Time of this scene's last frame; -1 = none since it came into view. */
  last: number;
}

/** A little under 1/30 s, so a 60 Hz display lands on every other frame instead of drifting. */
const FRAME_MS = 1000 / 30 - 3;
/** Longest step after a stall, so nothing jumps when the page comes back. */
const MAX_STEP_SECONDS = 0.1;
/** Time per frame spent building scenes that just came into view (at least one is built). */
const BUILD_BUDGET_MS = 6;
/** Most of a random head start each scene gets, so a grid of previews doesn't loop in step. */
const HEAD_START_SECONDS = 1.5;
/** Step used to play a scene forward without drawing it. */
const SKIP_STEP_SECONDS = 1 / 30;

const entries = new Map<Element, Entry>();
let sight: IntersectionObserver | null = null;
let sizes: ResizeObserver | null = null;
let frame = 0;
let lastFrame = Number.NEGATIVE_INFINITY;

/**
 * Plays the scene `build` makes for `canvas` until disposed; under reduced motion, shows
 * it as it looks `stillAt` seconds in.
 */
export function play(canvas: HTMLCanvasElement, build: () => Scene, stillAt: number): Disposable {
  const entry: Entry = { build, scene: null, visible: false, last: -1 };
  entries.set(canvas, entry);
  sizes ??= new ResizeObserver(onResize);
  sizes.observe(canvas);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const scene = (entry.scene = build());
    skip(scene, stillAt);
    scene.draw();
  } else {
    sight ??= new IntersectionObserver(onSight);
    sight.observe(canvas);
  }
  return {
    dispose() {
      entries.delete(canvas);
      sight?.unobserve(canvas);
      sizes?.unobserve(canvas);
      entry.scene?.dispose();
    },
  };
}

function onSight(records: IntersectionObserverEntry[]): void {
  for (const record of records) {
    const entry = entries.get(record.target);
    if (!entry) continue;
    entry.visible = record.isIntersecting;
    entry.last = -1;
  }
  if (!frame && anyVisible()) frame = requestAnimationFrame(loop);
}

function onResize(records: ResizeObserverEntry[]): void {
  for (const record of records) {
    const scene = entries.get(record.target)?.scene;
    scene?.resize();
    scene?.draw();
  }
}

function loop(now: number): void {
  frame = 0;
  if (now - lastFrame >= FRAME_MS) {
    lastFrame = now;
    const buildUntil = performance.now() + BUILD_BUDGET_MS;
    let built = 0;
    for (const [canvas, entry] of entries) {
      if (!entry.visible) continue;
      try {
        if (!entry.scene) {
          if (built > 0 && performance.now() > buildUntil) continue;
          entry.scene = entry.build();
          skip(entry.scene, Math.random() * HEAD_START_SECONDS);
          built++;
        }
        const dt = entry.last < 0 ? 0 : Math.min(MAX_STEP_SECONDS, (now - entry.last) / 1000);
        entry.last = now;
        entry.scene.advance(dt);
        entry.scene.draw();
      } catch (error) {
        // A broken illustration must not take the menus down with it: stop playing just this one.
        entries.delete(canvas);
        console.error('[landgrab] art scene failed', error);
      }
    }
  }
  if (anyVisible()) frame = requestAnimationFrame(loop);
}

/** Plays `seconds` of a scene without drawing it. */
function skip(scene: Scene, seconds: number): void {
  for (let left = seconds; left > 0; left -= SKIP_STEP_SECONDS) scene.advance(Math.min(SKIP_STEP_SECONDS, left));
}

function anyVisible(): boolean {
  for (const entry of entries.values()) if (entry.visible) return true;
  return false;
}
