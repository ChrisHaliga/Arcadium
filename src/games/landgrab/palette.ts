/**
 * Player colours. Humans get vivid colours, bots get muted ones so real people stand out.
 * Each entry: base (territory), light (trail), dark (tile edge / outline).
 */
import type { PlayerColor } from '../../shared/services';

export type { PlayerColor };

export const HUMAN_COLORS: readonly PlayerColor[] = [
  { name: 'Cherry', base: '#ff3b5c', light: '#ff8fa3', dark: '#c4123a' },
  { name: 'Tangerine', base: '#ff8a1f', light: '#ffbb73', dark: '#c95f00' },
  { name: 'Lemon', base: '#ffd21f', light: '#ffe57a', dark: '#c9a000' },
  { name: 'Lime', base: '#7ed321', light: '#b5ef73', dark: '#549a0b' },
  { name: 'Mint', base: '#1fd6a0', light: '#7aecc9', dark: '#0e9a72' },
  { name: 'Sky', base: '#1fb4ff', light: '#7ad3ff', dark: '#0080c4' },
  { name: 'Cobalt', base: '#3d5bff', light: '#8c9dff', dark: '#1f33c4' },
  { name: 'Violet', base: '#9b3dff', light: '#c48cff', dark: '#6a12c9' },
  { name: 'Magenta', base: '#ff3dd4', light: '#ff8ce6', dark: '#c412a0' },
  { name: 'Coral', base: '#ff6f61', light: '#ffa79e', dark: '#c94236' },
  { name: 'Aqua', base: '#00e5ff', light: '#73f0ff', dark: '#00a8bd' },
  { name: 'Rose', base: '#ff5c9d', light: '#ff9cc3', dark: '#c42e6b' },
];

/**
 * Sixteen dusty colours, as many as a room has seats: a new bot takes the least used one,
 * so bots in a room never share a colour. All have about a quarter of the human colours'
 * saturation, spread round the hue wheel and over two shades so that neighbours stay
 * easy to tell apart, and keep clear of the arena floor's lavender.
 */
export const BOT_COLORS: readonly PlayerColor[] = [
  { name: 'Rosewood', base: '#ad8082', light: '#ceacad', dark: '#7d5657' },
  { name: 'Blush', base: '#d4aba1', light: '#f6d8d0', dark: '#a27e74' },
  { name: 'Terracotta', base: '#9e7662', light: '#bea192', dark: '#6f4c3a' },
  { name: 'Biscuit', base: '#bba07f', light: '#decab3', dark: '#8b7355' },
  { name: 'Olive', base: '#807c54', light: '#a5a386', dark: '#55512c' },
  { name: 'Straw', base: '#bab98e', light: '#e3e2c3', dark: '#8c8a63' },
  { name: 'Moss', base: '#849875', light: '#b0bfa5', dark: '#596b4c' },
  { name: 'Sage', base: '#8cab8d', light: '#bbd2bc', dark: '#617d62' },
  { name: 'Juniper', base: '#568476', light: '#88a89e', dark: '#2e584c' },
  { name: 'Seafoam', base: '#95c3c3', light: '#caeaea', dark: '#6a9494' },
  { name: 'Teal', base: '#6f9da2', light: '#a3c3c7', dark: '#457074' },
  { name: 'Sky', base: '#8aadc3', light: '#bcd5e5', dark: '#5f7f93' },
  { name: 'Denim', base: '#6681a1', light: '#94a8c0', dark: '#3d5672' },
  { name: 'Heather', base: '#9a8cb1', light: '#c0b7d2', dark: '#6d6081' },
  { name: 'Plum', base: '#866b8a', light: '#a995ac', dark: '#5a425e' },
  { name: 'Mauve', base: '#c69bae', light: '#e8c9d6', dark: '#956f80' },
];

export function playerColor(kind: 'human' | 'bot', index: number): PlayerColor {
  const list = kind === 'human' ? HUMAN_COLORS : BOT_COLORS;
  return list[((index % list.length) + list.length) % list.length];
}

/** Map background colours. */
export const MAP_COLORS = {
  void: '#1b1440',
  voidPattern: '#231a52',
  floor: '#f3efff',
  floorAlt: '#e9e3fb',
  edge: '#cfc5f2',
  treasure: '#ffcc33',
};
