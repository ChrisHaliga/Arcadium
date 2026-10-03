/**
 * Menu controls for keyboard and gamepad (Steam Deck): arrows / d-pad / left stick move
 * focus between the controls inside a root, Enter / A activates, Escape / B goes back,
 * LB / RB switch tabs. Pointer input hides the focus ring again, so mouse and touch
 * players never see it.
 */
import { focusFirst, moveFocus, type NavDir } from './spatial';
import './nav.css';

export interface NavActions {
  /** Escape / B. */
  back(): void;
  /** LB / RB; omit where there are no tabs. */
  switchTab?(delta: 1 | -1): void;
  /** Called after focus moved, e.g. for a hover tick. */
  moved?(): void;
}

const KEY_DIRS: Readonly<Record<string, NavDir>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const DIR_KEYS: Readonly<Record<NavDir, string>> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** Controls that act on Enter by themselves; anything else focusable is clicked for it. */
const NATIVE_ENTER = 'button, a[href], input, select, textarea';

/** Standard gamepad mapping. */
const PAD = { a: 0, b: 1, lb: 4, rb: 5, up: 12, down: 13, left: 14, right: 15 } as const;
const STICK_THRESHOLD = 0.55;
const REPEAT_DELAY_MS = 380;
const REPEAT_EVERY_MS = 130;

type PadControl = NavDir | 'a' | 'b' | 'lb' | 'rb';

let lastFocus: HTMLElement | null = null;

/**
 * The control focused most recently. Opening a dialog makes the screen behind it inert,
 * which drops focus to <body>; this still knows where to return to.
 */
export function lastFocused(): HTMLElement | null {
  return lastFocus?.isConnected ? lastFocus : null;
}

/** True while the keyboard or a pad is driving the menus: dialogs focus their first control only then. */
export function usingKeys(): boolean {
  return document.documentElement.dataset.nav === 'keys';
}

/** Focus rings show only while the keyboard or a pad is in use (see nav.css). */
function setNavMode(mode: 'keys' | 'pointer'): void {
  if (document.documentElement.dataset.nav !== mode) document.documentElement.dataset.nav = mode;
}

/**
 * Starts menu navigation inside `root` and returns the function that stops it.
 * `enabled` is checked on every input, so a screen can hand the controls to something
 * else (the hub to a running game, a match to its steering) without uninstalling.
 */
export function installNav(root: HTMLElement, actions: NavActions, enabled: () => boolean = () => true): () => void {
  const move = (dir: NavDir) => {
    setNavMode('keys');
    if (moveFocus(root, dir)) actions.moved?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!enabled() || e.defaultPrevented) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    const dir = KEY_DIRS[e.key];
    if (dir) {
      // Text fields keep left/right for the caret and sliders for their value.
      const keepsHorizontal = target?.matches('input[type="text"], input[type="range"]') ?? false;
      if (keepsHorizontal && (dir === 'left' || dir === 'right')) {
        setNavMode('keys');
        return;
      }
      e.preventDefault();
      move(dir);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (target?.matches('input[type="text"]')) target.blur();
      else actions.back();
    } else if (e.key === 'Enter' && target && target !== root && root.contains(target) && !target.matches(NATIVE_ENTER)) {
      e.preventDefault();
      setNavMode('keys');
      target.click();
    } else if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
      setNavMode('keys');
    }
  };

  const onPointer = () => setNavMode('pointer');
  const onFocus = (e: FocusEvent) => {
    if (e.target instanceof HTMLElement) lastFocus = e.target;
  };

  window.addEventListener('focusin', onFocus);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
  const stopPad = pollGamepads((control) => {
    if (!enabled()) return;
    setNavMode('keys');
    const focused =
      document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    switch (control) {
      case 'a':
        if (focused && focused !== root) focused.click();
        else if (focusFirst(root)) actions.moved?.();
        break;
      case 'b':
        actions.back();
        break;
      case 'lb':
        actions.switchTab?.(-1);
        break;
      case 'rb':
        actions.switchTab?.(1);
        break;
      default:
        if (focused instanceof HTMLInputElement && focused.type === 'range' && (control === 'left' || control === 'right')) {
          nudgeRange(focused, control === 'right' ? 1 : -1);
        } else {
          // Replayed as an arrow key, so controls with their own arrow handling (a carousel)
          // behave the same for pads; unhandled, it reaches onKey and moves focus.
          const arrow = new KeyboardEvent('keydown', { key: DIR_KEYS[control], bubbles: true, cancelable: true });
          (focused ?? root).dispatchEvent(arrow);
        }
    }
  });

  return () => {
    window.removeEventListener('focusin', onFocus);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer, { capture: true });
    stopPad();
  };
}

function nudgeRange(input: HTMLInputElement, delta: 1 | -1): void {
  if (delta > 0) input.stepUp();
  else input.stepDown();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Polls connected pads every frame (the Gamepad API has no button events), turning
 * presses into controls with key-style auto-repeat on directions.
 */
function pollGamepads(onControl: (control: PadControl) => void): () => void {
  if (typeof navigator.getGamepads !== 'function') return () => {};
  const held = new Map<PadControl, number>();
  let frame = 0;

  const read = (): Set<PadControl> => {
    const down = new Set<PadControl>();
    for (const pad of navigator.getGamepads()) {
      if (!pad?.connected) continue;
      const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
      const [x = 0, y = 0] = pad.axes;
      if (pressed(PAD.a)) down.add('a');
      if (pressed(PAD.b)) down.add('b');
      if (pressed(PAD.lb)) down.add('lb');
      if (pressed(PAD.rb)) down.add('rb');
      if (pressed(PAD.up) || y < -STICK_THRESHOLD) down.add('up');
      if (pressed(PAD.down) || y > STICK_THRESHOLD) down.add('down');
      if (pressed(PAD.left) || x < -STICK_THRESHOLD) down.add('left');
      if (pressed(PAD.right) || x > STICK_THRESHOLD) down.add('right');
    }
    return down;
  };

  const loop = (now: number) => {
    const down = read();
    for (const control of [...held.keys()]) if (!down.has(control)) held.delete(control);
    for (const control of down) {
      const nextAt = held.get(control);
      if (nextAt === undefined) {
        held.set(control, now + REPEAT_DELAY_MS);
        onControl(control);
      } else if (now >= nextAt && isDirection(control)) {
        held.set(control, now + REPEAT_EVERY_MS);
        onControl(control);
      }
    }
    frame = requestAnimationFrame(loop);
  };

  // Only poll while a pad is connected; browsers announce pads after their first button press.
  const start = () => {
    if (!frame) frame = requestAnimationFrame(loop);
  };
  const stopIfNone = () => {
    if ([...navigator.getGamepads()].some((pad) => pad?.connected)) return;
    cancelAnimationFrame(frame);
    frame = 0;
    held.clear();
  };
  window.addEventListener('gamepadconnected', start);
  window.addEventListener('gamepaddisconnected', stopIfNone);
  if ([...navigator.getGamepads()].some((pad) => pad?.connected)) start();

  return () => {
    window.removeEventListener('gamepadconnected', start);
    window.removeEventListener('gamepaddisconnected', stopIfNone);
    cancelAnimationFrame(frame);
  };
}

function isDirection(control: PadControl): control is NavDir {
  return control === 'up' || control === 'down' || control === 'left' || control === 'right';
}
