/**
 * Spatial focus movement for keyboard and gamepad: from the focused control, pick the
 * nearest one in the pressed direction by on-screen geometry, so menus and overlays need
 * no hand-made focus order. The last [data-nav-scope] inside the root (an open dialog)
 * confines the search.
 */

export type NavDir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** How much being off-axis costs compared to being further away along the axis. */
const OFF_AXIS_WEIGHT = 2.5;
const ALIGN_WEIGHT = 0.3;
/**
 * Anything sharing the current row (or column) beats anything outside it, however far:
 * left along a top bar should run along the bar, not dive into the content below.
 */
const OUT_OF_LINE_PENALTY = 600;
/** Room kept between a focused control and the edge of the list it is scrolled into. */
const SCROLL_MARGIN_PX = 16;

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Where focus may go: the last [data-nav-scope] under `root` (the topmost dialog), or `root` itself. */
export function navScope(root: HTMLElement): HTMLElement {
  const scopes = root.querySelectorAll<HTMLElement>('[data-nav-scope]');
  return scopes.length > 0 ? scopes[scopes.length - 1] : root;
}

/** Controls a player can reach: rendered, not inert, and not taken out of the tab order (tabindex -1). */
export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      el.getClientRects().length > 0 &&
      !el.closest('[inert]') &&
      getComputedStyle(el).visibility !== 'hidden',
  );
}

/** Focuses the scope's [data-autofocus] control, or its first one. False when there is nothing to focus. */
export function focusFirst(root: HTMLElement): boolean {
  const items = focusables(navScope(root));
  const preferred = items.find((el) => el.hasAttribute('data-autofocus')) ?? items[0];
  if (!preferred) return false;
  focusElement(preferred);
  return true;
}

/** Moves focus one step in `dir`; with nothing focused in the scope, focuses its first control. */
export function moveFocus(root: HTMLElement, dir: NavDir): boolean {
  const scope = navScope(root);
  const active = document.activeElement;
  const current = active instanceof HTMLElement && active !== scope && scope.contains(active) ? active : null;
  if (!current) return focusFirst(root);
  const from = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of focusables(scope)) {
    if (el === current) continue;
    const score = directionalScore(from, el.getBoundingClientRect(), dir);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) focusElement(best);
  return best !== null;
}

function focusElement(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  revealInScroller(el);
}

/**
 * Scrolls the nearest user-scrollable ancestor just enough to show `el`. Only that list
 * moves: scrollIntoView would also shift clipped containers (overflow: hidden), which
 * layouts that place their items themselves (carousels) rely on staying put.
 */
function revealInScroller(el: HTMLElement): void {
  const scroller = scrollParent(el);
  if (!scroller) return;
  const box = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const delta =
    box.top - SCROLL_MARGIN_PX < view.top
      ? box.top - SCROLL_MARGIN_PX - view.top
      : box.bottom + SCROLL_MARGIN_PX > view.bottom
        ? Math.min(box.bottom + SCROLL_MARGIN_PX - view.bottom, box.top - SCROLL_MARGIN_PX - view.top)
        : 0;
  if (delta !== 0) scroller.scrollBy({ top: delta, behavior: reducedMotion?.matches ? 'auto' : 'smooth' });
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

function directionalScore(from: DOMRect, to: DOMRect, dir: NavDir): number {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  const fromCentre = horizontal ? from.left + from.width / 2 : from.top + from.height / 2;
  const toCentre = horizontal ? to.left + to.width / 2 : to.top + to.height / 2;
  if ((toCentre - fromCentre) * sign <= 1) return Infinity;

  // Gap between the facing edges along the axis (0 when they overlap).
  const gap = horizontal
    ? Math.max(0, sign > 0 ? to.left - from.right : from.left - to.right)
    : Math.max(0, sign > 0 ? to.top - from.bottom : from.top - to.bottom);
  // Distance between the two boxes across the axis (0 when they share a row/column).
  const offAxis = horizontal
    ? Math.max(0, to.top - from.bottom, from.top - to.bottom)
    : Math.max(0, to.left - from.right, from.left - to.right);
  const misalignment = horizontal
    ? Math.abs(to.top + to.height / 2 - (from.top + from.height / 2))
    : Math.abs(to.left + to.width / 2 - (from.left + from.width / 2));
  // Outside the current row/column, only things roughly in the pressed direction (within ~63°) count.
  if (offAxis > 0 && misalignment > 2 * Math.abs(toCentre - fromCentre)) return Infinity;
  return gap + offAxis * OFF_AXIS_WEIGHT + misalignment * ALIGN_WEIGHT + (offAxis > 0 ? OUT_OF_LINE_PENALTY : 0);
}
