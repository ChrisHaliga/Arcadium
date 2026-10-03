/**
 * The hub's sound-and-touch language. Every control gets a hover tick, a tap pop and a
 * light buzz through one set of delegated listeners, so no button can forget them.
 * Controls with their own cue (claims, purchases) opt out of the tap pop with data-sfx="none".
 */
import type { AudioService, HapticsService } from '../../shared/services';
import type { CoinFx } from './coins';
import { replayClass } from './motion';
import type { Toasts } from './toasts';

export interface Feedback {
  /** Error cue, buzz, toast, and a shake of `target` when given. */
  error(text: string, target?: Element | null): void;
  /** The error for a purchase the wallet can't cover: shakes the coin pill. */
  notEnoughCoins(): void;
  /** Reward cue and a success buzz, with an optional toast. */
  success(text?: string): void;
  /** Wires hover/tap sounds and haptics for every control under `root`. Returns an uninstall function. */
  installUiSounds(root: HTMLElement): () => void;
}

const INTERACTIVE = 'button, [role="button"], [role="tab"], [role="switch"], a[href], input, [data-interactive]';

export function createFeedback(audio: AudioService, haptics: HapticsService, toasts: Toasts, coins: CoinFx): Feedback {
  const error = (text: string, target?: Element | null) => {
    audio.play('error');
    haptics.notify('error');
    toasts.show(text, 'error');
    replayClass(target, 'is-shaking');
  };

  return {
    error,
    notEnoughCoins() {
      error('Not enough coins', coins.target()?.closest('.coin-pill'));
    },
    success(text) {
      audio.play('reward');
      haptics.notify('success');
      if (text) toasts.show(text, 'success');
    },
    installUiSounds(root) {
      let hovered: Element | null = null;
      const control = (e: Event): HTMLElement | null => {
        const el = (e.target as Element | null)?.closest<HTMLElement>(INTERACTIVE);
        return el && root.contains(el) && !el.matches(':disabled') ? el : null;
      };
      const onOver = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        const el = control(e);
        if (el && el !== hovered) audio.play('hover');
        hovered = el;
      };
      const onDown = (e: PointerEvent) => {
        if (control(e)) haptics.impact('light');
      };
      const onClick = (e: MouseEvent) => {
        const el = control(e);
        // Sliders and text fields make their own feedback while being used.
        if (!el || el.dataset.sfx === 'none' || el.matches('input')) return;
        audio.play('click');
      };
      root.addEventListener('pointerover', onOver);
      root.addEventListener('pointerdown', onDown);
      root.addEventListener('click', onClick);
      return () => {
        root.removeEventListener('pointerover', onOver);
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('click', onClick);
      };
    },
  };
}
