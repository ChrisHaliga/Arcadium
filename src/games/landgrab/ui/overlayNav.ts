/**
 * Keyboard and gamepad control of the match overlays, through the shared spatial nav. It
 * is on only while a dialog is up (otherwise the same keys and pad steer), and whenever a
 * dialog comes to the top its preferred control takes focus, so Enter or A presses it
 * straight away. Focus is invisible until keys or a pad are used, so pointer players
 * never see it.
 */
import { effect } from '@preact/signals';
import { focusFirst, installNav, navScope } from '../../../shared/ui/nav';
import type { GameUi } from './store';

/** Starts navigation inside `root` (the overlay layer) and returns the function that stops it. */
export function installOverlayNav(root: HTMLElement, ui: GameUi): () => void {
  const uninstall = installNav(
    root,
    {
      back: () => ui.back(),
      moved: () => ui.services.audio.play('hover'),
    },
    () => ui.dialog.peek() !== null,
  );
  let frame = 0;
  const stopWatching = effect(() => {
    // Another dialog on top, a fresh results screen, or a new full-screen state.
    void ui.dialog.value;
    void ui.results.value;
    void ui.screen.value;
    cancelAnimationFrame(frame);
    // On the next frame, once Preact has rendered the change.
    frame = requestAnimationFrame(() => focusPreferred(root));
  });
  return () => {
    cancelAnimationFrame(frame);
    stopWatching();
    uninstall();
  };
}

/**
 * Focuses the top dialog's [data-autofocus] control unless focus is already inside that
 * dialog. A dialog without one (connecting) waits for the first key or button instead, so
 * an impatient extra press can't trigger anything.
 */
function focusPreferred(root: HTMLElement): void {
  const scope = navScope(root);
  if (scope === root || scope.contains(document.activeElement)) return;
  if (scope.querySelector('[data-autofocus]')) focusFirst(root);
}
