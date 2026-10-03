/**
 * Keyboard and gamepad navigation for any screen: spatial focus movement between the
 * focusable elements inside a root, activation, back, and focus rings that only show
 * while keys or a pad are in use. Shared by the hub's menus and in-game overlays.
 *
 * Markup conventions: [data-nav-scope] on a dialog confines focus to it (the last one in
 * the root wins), [data-autofocus] marks the control a scope focuses first, tabindex="-1"
 * takes a control out of navigation.
 */
export { installNav, lastFocused, usingKeys, type NavActions } from './input';
export { focusFirst, focusables, moveFocus, navScope, type NavDir } from './spatial';
