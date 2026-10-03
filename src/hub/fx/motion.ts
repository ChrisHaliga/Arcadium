/** The player's reduced-motion preference, live. Big motion (particles, flights, shakes) checks it. */
import { signal, type ReadonlySignal } from '@preact/signals';

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduced = signal(query?.matches ?? false);
query?.addEventListener('change', (e) => {
  reduced.value = e.matches;
});

export const reducedMotion: ReadonlySignal<boolean> = reduced;

/** Restarts a one-shot CSS animation class on `el` (shake, bump) even if it is already running. */
export function replayClass(el: Element | null | undefined, className: string): void {
  if (!el) return;
  el.classList.remove(className);
  // Reading layout forces the removal to apply, so re-adding the class starts the animation over.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
}
