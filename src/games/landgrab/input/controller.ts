/**
 * Input controller: mouse/trackpad, touch joystick, keyboard and gamepad all turn into
 * one target heading. The device used last is in charge: a mouse resting on the screen
 * does not fight the keyboard, and the mouse takes over again as soon as it moves.
 * onSteer only fires when the heading actually changes.
 */
import { headingDelta, headingTo } from '../core';
import type { Heading } from '../core/types';
import type { CreateInput, InputAction, InputHandle, InputOptions } from './contract';
import { keyAction, keyBit, maskHeading, PadReader } from './devices';
import { JOYSTICK_RADIUS, JoystickView } from './joystick';

/** The cursor this close to the head (CSS px) keeps the current heading instead of spinning. */
const MOUSE_DEADZONE = 10;
/** Finger travel (CSS px) before the joystick steers. */
const TOUCH_DEADZONE = 9;
/** Stick headings closer than this to the last one are noise, not a turn. */
const STICK_JITTER = 3;

type Device = 'mouse' | 'touch' | 'keys' | 'pad' | null;

export const createInput: CreateInput = (opts: InputOptions): InputHandle => {
  const { target, headScreenPos, onSteer, onAction, enabled = () => true } = opts;
  let heading: Heading | null = null;
  let device: Device = null;
  // Mouse: last pointer position relative to the target.
  let mouseX = 0;
  let mouseY = 0;
  // Touch joystick: the tracked finger, the ring centre and the finger, client px.
  let touchId: number | null = null;
  let baseX = 0;
  let baseY = 0;
  let joystick: JoystickView | null = null;
  let keysHeld = 0;
  let padHeading: Heading | null = null;
  const pad = new PadReader();
  let frame = 0;

  const previousTouchAction = target.style.touchAction;
  target.style.touchAction = 'none';

  function steer(h: Heading): void {
    if (h === heading || !enabled()) return;
    heading = h;
    onSteer(h);
  }

  function aimMouse(): void {
    const head = headScreenPos();
    if (!head) return;
    const dx = mouseX - head.x;
    const dy = mouseY - head.y;
    if (dx * dx + dy * dy < MOUSE_DEADZONE * MOUSE_DEADZONE) return;
    steer(headingTo(dx, dy));
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') {
      onPointerMove(e);
      return;
    }
    if (touchId !== null) return;
    touchId = e.pointerId;
    device = 'touch';
    baseX = e.clientX;
    baseY = e.clientY;
    joystick ??= new JoystickView();
    joystick.place(baseX, baseY, baseX, baseY);
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety (keeps the drag when the finger crosses an overlay); steering works without it.
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerType !== 'touch') {
      const rect = target.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      device = 'mouse';
      aimMouse();
      return;
    }
    if (e.pointerId !== touchId) return;
    let dx = e.clientX - baseX;
    let dy = e.clientY - baseY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > JOYSTICK_RADIUS) {
      // Floating stick: the ring follows a finger that drags past its edge.
      const pull = (len - JOYSTICK_RADIUS) / len;
      baseX += dx * pull;
      baseY += dy * pull;
      dx = e.clientX - baseX;
      dy = e.clientY - baseY;
    }
    joystick?.place(baseX, baseY, baseX + dx, baseY + dy);
    if (len > TOUCH_DEADZONE) steer(headingTo(dx, dy));
  }

  function onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== touchId) return;
    touchId = null;
    joystick?.hide();
  }

  function isTyping(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  function onKeyDown(e: KeyboardEvent): void {
    // A key the menu just handled arrives prevented, the menu already gone (Escape resuming).
    if (e.defaultPrevented || !enabled() || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    const bit = keyBit(e.code);
    if (bit !== 0) {
      e.preventDefault();
      keysHeld |= bit;
      device = 'keys';
      const h = maskHeading(keysHeld);
      if (h !== null) steer(h);
      return;
    }
    const action = keyAction(e.code);
    if (action && !e.repeat) {
      e.preventDefault();
      act(action);
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const bit = keyBit(e.code);
    if (bit === 0) return;
    keysHeld &= ~bit;
    // Releasing one key of a diagonal leaves the other direction; releasing all keeps going.
    const h = maskHeading(keysHeld);
    if (h !== null && device === 'keys') steer(h);
  }

  function onBlur(): void {
    keysHeld = 0;
  }

  function act(action: InputAction): void {
    onAction?.(action);
  }

  function pollPad(): void {
    if (!pad.read()) return;
    const reading = pad.reading;
    for (const action of reading.pressed) act(action);
    // Meanwhile a menu moves its focus with the same stick and d-pad.
    if (!enabled()) return;
    const h = reading.heading;
    if (h === null) {
      padHeading = null;
      return;
    }
    if (padHeading !== null && Math.abs(headingDelta(padHeading, h)) < STICK_JITTER) return;
    padHeading = h;
    device = 'pad';
    steer(h);
  }

  function tick(): void {
    frame = requestAnimationFrame(tick);
    pollPad();
    // The head moves under a still cursor, so the mouse is re-aimed every frame.
    if (device === 'mouse') aimMouse();
  }

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  frame = requestAnimationFrame(tick);

  return {
    dispose() {
      cancelAnimationFrame(frame);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      joystick?.dispose();
      target.style.touchAction = previousTouchAction;
    },
  };
};
