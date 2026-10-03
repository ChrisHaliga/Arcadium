/**
 * Visual tuning for the renderer: sizes in cells (the sim's raster unit, ~1/7 of a head)
 * and the few effect colours that are not player or map colours. Player and map colours
 * come from palette.ts.
 */
import { MAP_COLORS } from '../palette';
import { mix } from './colors';

/** Device pixel ratio cap: past 2x the extra pixels cost more fill time than they add. */
export const MAX_DPR = 2;

export const SIZES = {
  /** Height of the darker raised edge under each territory slab. */
  landLip: 1.15,
  /** The arena's own slab edge and the darker band under it. */
  arenaRim: 2.6,
  arenaRimDeep: 3.6,
  /** Floor pattern: one dot per spacing x spacing cells, alternate rows offset by half. */
  floorDotSpacing: 9,
  floorDotRadius: 0.75,
  /** Trail stroke widths: edge (owner colour) and core (light colour). The sim's band is 5 cells. */
  trailEdge: 4.2,
  trailCore: 2.9,
  /** Head side length; bots are drawn noticeably smaller. */
  humanHead: 6.8,
  botHead: 5.1,
  headLip: 0.95,
  gem: 4,
} as const;

/** Camera: CSS pixels per cell on a 390 x 844 phone, scaled gently with screen size. */
export const CAMERA = {
  phoneScale: 4.9,
  phoneArea: 390 * 844,
  /** How strongly larger screens zoom in (0 = same cells visible, 0.5 = same physical size). */
  screenExponent: 0.3,
  /** Zoom-out with land: scale / (1 + landZoom * sqrt(share of map)). */
  landZoom: 0.85,
  attractZoom: 0.62,
  followSeconds: 0.09,
  attractFollowSeconds: 1.4,
  zoomSeconds: 0.9,
  /** Shake offset at full trauma, CSS px. */
  shakePx: 18,
} as const;

/** Wave fill: newly captured land sweeps out from the closing point. */
export const WAVE = {
  minMs: 200,
  maxMs: 750,
  baseMs: 150,
  msPerCell: 8,
  /** The front advances in steps of this length (30 per second). */
  stepMs: 1000 / 30,
} as const;

/** Trails glow hotter from this many path points (ticks outside) up to the second number. */
export const TRAIL_HEAT = { start: 40, full: 200 } as const;

export const FX_COLORS = {
  coin: '#ffcc33',
  coinRim: '#d99a00',
  coinShine: '#fff4c2',
  heatWarm: '#ffcc33',
  flameEdge: '#ff5a2a',
  flameCore: '#ffc53d',
  heatHot: '#ff3b3b',
  eyeWhite: '#ffffff',
  pupil: '#1b1440',
  labelText: '#ffffff',
  labelStroke: 'rgba(27, 20, 64, 0.75)',
  smoke: '#e9e3fb',
  bolt: '#bfe8ff',
  hole: '#0b0720',
  holeRim: '#9b3dff',
  galaxyBase: '#1d1145',
  confetti: ['#ff3b5c', '#ffd21f', '#1fd6a0', '#1fb4ff', '#9b3dff', '#ff8a1f'],
} as const;

/** Map colours derived once from the palette. */
export const ARENA = {
  void: MAP_COLORS.void,
  voidPattern: MAP_COLORS.voidPattern,
  floor: MAP_COLORS.floor,
  floorAlt: MAP_COLORS.floorAlt,
  rim: MAP_COLORS.edge,
  rimDeep: mix(MAP_COLORS.edge, MAP_COLORS.void, 0.45),
  treasure: MAP_COLORS.treasure,
  shadow: '#05020f',
} as const;
