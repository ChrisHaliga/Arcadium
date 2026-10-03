/**
 * Per-device mappings: keyboard keys to directions and gamepad state to a heading and
 * button presses. Kept free of listeners so the controller decides when to read them.
 */
import { headingTo } from '../core';
import type { Heading } from '../core/types';
import type { InputAction } from './contract';

/** Bits of the held-direction mask. */
const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

const KEY_BITS: Readonly<Record<string, number>> = {
  ArrowUp: UP,
  KeyW: UP,
  ArrowDown: DOWN,
  KeyS: DOWN,
  ArrowLeft: LEFT,
  KeyA: LEFT,
  ArrowRight: RIGHT,
  KeyD: RIGHT,
};

const KEY_ACTIONS: Readonly<Record<string, InputAction>> = {
  Escape: 'pause',
};

/** Direction bit for a KeyboardEvent.code (layout-independent WASD), or 0. */
export function keyBit(code: string): number {
  return KEY_BITS[code] ?? 0;
}

export function keyAction(code: string): InputAction | null {
  return KEY_ACTIONS[code] ?? null;
}

/** One of 8 headings for a held-direction mask; null when nothing (or only opposites) is held. */
export function maskHeading(mask: number): Heading | null {
  const dx = (mask & RIGHT ? 1 : 0) - (mask & LEFT ? 1 : 0);
  const dy = (mask & DOWN ? 1 : 0) - (mask & UP ? 1 : 0);
  return dx === 0 && dy === 0 ? null : headingTo(dx, dy);
}

/** Standard-mapping gamepad indices. */
const PAD = { start: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const PAD_ACTIONS: readonly [number, InputAction][] = [[PAD.start, 'pause']];
/** Radial stick deadzone (0..1). */
const STICK_DEADZONE = 0.3;

export interface PadReading {
  /** Analog stick or d-pad heading, null while both are idle. */
  heading: Heading | null;
  /** Actions whose button went down since the last reading. */
  readonly pressed: InputAction[];
}

/** Reads the first connected gamepad into a reused reading, tracking button edges between calls. */
export class PadReader {
  private readonly down = new Uint8Array(32);
  readonly reading: PadReading = { heading: null, pressed: [] };

  /** Updates `reading`; false when no gamepad is connected. */
  read(): boolean {
    const out = this.reading;
    out.heading = null;
    out.pressed.length = 0;
    const pad = firstPad();
    if (!pad) {
      this.down.fill(0);
      return false;
    }
    for (const [index, action] of PAD_ACTIONS) {
      const isDown = pad.buttons[index]?.pressed ? 1 : 0;
      if (isDown && !this.down[index]) out.pressed.push(action);
      this.down[index] = isDown;
    }
    out.heading = stickHeading(pad) ?? dpadHeading(pad);
    return true;
  }
}

function firstPad(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  for (const pad of navigator.getGamepads()) if (pad && pad.connected) return pad;
  return null;
}

function stickHeading(pad: Gamepad): Heading | null {
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  return x * x + y * y < STICK_DEADZONE * STICK_DEADZONE ? null : headingTo(x, y);
}

function dpadHeading(pad: Gamepad): Heading | null {
  const b = pad.buttons;
  const mask =
    (b[PAD.up]?.pressed ? UP : 0) | (b[PAD.down]?.pressed ? DOWN : 0) | (b[PAD.left]?.pressed ? LEFT : 0) | (b[PAD.right]?.pressed ? RIGHT : 0);
  return maskHeading(mask);
}
