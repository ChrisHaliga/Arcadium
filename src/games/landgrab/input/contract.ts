/**
 * Input: turns mouse, touch, keyboard and gamepad into a target heading.
 *
 * CONTRACT FILE: implemented in input/index.ts as createInput.
 */
import type { Heading } from '../core/types';
import type { ScreenPoint } from '../render/contract';

/** Escape, or Start on a pad. Menus handle their own confirm and back (shared/ui/nav). */
export type InputAction = 'pause';

export interface InputOptions {
  /** Element receiving pointer/touch events (the game canvas or its container). */
  target: HTMLElement;
  /** Where the player's head is on screen, so the mouse can point relative to it. */
  headScreenPos: () => ScreenPoint | null;
  /** Called whenever the target heading changes. */
  onSteer: (heading: Heading) => void;
  onAction?: (action: InputAction) => void;
  /**
   * Checked on every input. While it returns false (a menu has the keyboard and pad),
   * nothing steers and Escape is left to the menu; only a pad's Start button still reports
   * 'pause', since menu navigation doesn't use it.
   */
  enabled?: () => boolean;
}

export interface InputHandle {
  /** Stop listening and remove any on-screen joystick. */
  dispose(): void;
}

export type CreateInput = (opts: InputOptions) => InputHandle;
