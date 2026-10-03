/**
 * The Landgrab renderer: draws a match as a smooth, Paper.io-style scene with the camera
 * following the player, and plays the event effects. The world itself is drawn by World;
 * the match adds the capture ghost over the land, names over the heads, flying coins on
 * top, and screen shake.
 */
import type { SimEvent, SimState, Slot } from '../core/types';
import { Coins } from './coins';
import type { CreateRenderer, Renderer, RendererOptions, ScreenPoint } from './contract';
import { CaptureGhost } from './ghost';
import { CAMERA } from './theme';
import { deviceRatio, World } from './world';

export const createRenderer: CreateRenderer = (canvas: HTMLCanvasElement, opts: RendererOptions): Renderer => {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('2D canvas is not available');
  const ctx: CanvasRenderingContext2D = context;
  const attract = opts.attract === true;
  const world = new World(ctx, opts.cosmetics);
  const { camera } = world;
  const coins = new Coins();

  let size = 0;
  let ghost = new CaptureGhost(0);
  let lastNow = -1;
  let mySlot: Slot = 0;
  let focusX = Number.NaN;
  let focusY = Number.NaN;

  /** The followed slot: `focus`, or the leader when focus is 0. 0 when nobody qualifies. */
  function followed(view: SimState, focus: Slot): Slot {
    if (focus !== 0) return focus;
    let best: Slot = 0;
    for (let s = 1; s < view.players.length; s++) {
      if (view.players[s]?.alive && (best === 0 || view.counts[s] > view.counts[best])) best = s;
    }
    return best;
  }

  function moveCamera(view: SimState, focus: Slot, dt: number): void {
    const slot = followed(view, focus);
    const { motion, clock } = world;
    if (slot !== 0 && motion.visible[slot]) {
      focusX = motion.x[slot];
      focusY = motion.y[slot];
    } else if (Number.isNaN(focusX)) {
      focusX = view.size / 2;
      focusY = view.size / 2;
    }
    let tx = focusX;
    let ty = focusY;
    let zoom: number;
    if (attract) {
      // A slow drift around the leader keeps the background alive.
      tx += Math.sin(clock * 0.13) * 22;
      ty += Math.cos(clock * 0.09) * 16;
      zoom = CAMERA.attractZoom;
    } else {
      const share = slot !== 0 && view.playable > 0 ? view.counts[slot] / view.playable : 0;
      zoom = 1 / (1 + CAMERA.landZoom * Math.sqrt(share));
    }
    camera.follow(tx, ty, zoom, dt, attract ? CAMERA.attractFollowSeconds : CAMERA.followSeconds);
    camera.updateShake(dt, clock, !attract && opts.screenShake());
  }

  function drawGhost(focus: Slot): void {
    const look = world.lookOf(mySlot || focus);
    if (look) ghost.draw(ctx, look.color.base, world.clock);
  }

  function cellToScreen(cell: number): ScreenPoint {
    const s = Math.max(1, size);
    return { x: camera.screenX((cell % s) + 0.5), y: camera.screenY(Math.floor(cell / s) + 0.5) };
  }

  /** Your captures and kills you are part of shake from onEvent; shake() adds anything else. */
  function shakeBy(strength: number): void {
    if (!attract && opts.screenShake()) camera.addTrauma(strength);
  }

  function onFontsLoaded(): void {
    world.refreshLooks();
  }
  document.fonts?.addEventListener('loadingdone', onFontsLoaded);

  const renderer: Renderer = {
    draw(view, alpha, nowMs, focus) {
      const dt = lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, (nowMs - lastNow) / 1000));
      lastNow = nowMs;
      if (view.size !== size) {
        size = view.size;
        ghost = new CaptureGhost(size);
      }
      if (world.update(view, alpha, dt)) {
        camera.unplace();
        ghost.clear();
      }
      moveCamera(view, focus, dt);
      world.animate(view, dt);
      coins.update(dt);

      world.drawArena(view);
      world.paintTerritory(ctx);
      drawGhost(focus);
      world.drawOnLand(view, true);
      ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
      coins.draw(ctx);
    },

    onEvent(e: SimEvent, state: SimState, me: Slot) {
      mySlot = me;
      world.playEvent(e, state);
      switch (e.t) {
        case 'capture':
          if (e.slot === me) shakeBy(Math.min(1, 0.15 + e.cells.length / 6000));
          return;
        case 'death':
          if (e.slot === me) shakeBy(0.7);
          else if (e.killer === me) shakeBy(0.35);
          return;
        case 'newRound':
          ghost.clear();
          return;
        default:
          return;
      }
    },

    setPreview(cells) {
      ghost.set(cells);
    },

    cellToScreen,

    headToScreen(slot) {
      const { motion } = world;
      if (slot <= 0 || slot >= motion.slots || !motion.visible[slot]) return null;
      return { x: camera.screenX(motion.x[slot]), y: camera.screenY(motion.y[slot]) };
    },

    coinBurst(fromCells, count, to, onArrive) {
      const centre: ScreenPoint = { x: camera.width / 2, y: camera.height / 2 };
      const from = (i: number): ScreenPoint =>
        fromCells.length === 0 ? centre : cellToScreen(fromCells[Math.floor((i * fromCells.length) / Math.max(1, count))]);
      coins.burst(from, count, to, onArrive);
    },

    shake: shakeBy,

    resize() {
      const ratio = deviceRatio();
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      camera.width = w;
      camera.height = h;
      world.dpr = ratio;
    },

    dispose() {
      document.fonts?.removeEventListener('loadingdone', onFontsLoaded);
      world.dispose();
    },
  };
  renderer.resize();
  return renderer;
};
