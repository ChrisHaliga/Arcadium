/**
 * Everything a player looks like, resolved once per profile: palette colours, cosmetic
 * styles, the territory fill, the head sprite and the name label. Drawing code only
 * reads these cached objects, so frames never build colours, patterns or text.
 */
import type { CosmeticDef } from '../../../shared/services';
import type { PlayerProfile } from '../core/types';
import { playerColor, type PlayerColor } from '../palette';
import { mix } from './colors';
import { landFill, paintSkin, skinStyle, type SkinStyle } from './skins';
import { FX_COLORS, SIZES } from './theme';

export type TrailStyle = 'plain' | 'sparkle' | 'bubbles' | 'glitter' | 'comet' | 'fire' | 'rainbow';
export type CaptureStyle = 'wave' | 'ripple' | 'confetti' | 'shockwave' | 'fireworks';
export type KillStyle = 'burst' | 'poof' | 'shatter' | 'lightning' | 'blackhole';

const TRAILS: readonly TrailStyle[] = ['plain', 'sparkle', 'bubbles', 'glitter', 'comet', 'fire', 'rainbow'];
const CAPTURES: readonly CaptureStyle[] = ['wave', 'ripple', 'confetti', 'shockwave', 'fireworks'];
const KILLS: readonly KillStyle[] = ['burst', 'poof', 'shatter', 'lightning', 'blackhole'];

export interface Look {
  color: PlayerColor;
  skin: SkinStyle;
  trail: TrailStyle;
  capture: CaptureStyle;
  kill: KillStyle;
  /** Trail outer stroke and core: the base and light colours, or flame colours for fire trails. */
  trailEdge: string;
  trailCore: string;
  /** Territory top fill: base colour or a world-anchored skin pattern. */
  land: string | CanvasPattern;
  /** Head top face, HEAD_SPRITE_PX square, drawn rotated to the direction of travel. */
  head: HTMLCanvasElement;
  /** Head side length in cells. */
  headSize: number;
  /** Name label at the current device pixel ratio, or null for an empty name. */
  label: HTMLCanvasElement | null;
}

const HEAD_SPRITE_PX = 112;
/** Corner radius of a head as a fraction of its side. */
const HEAD_ROUNDNESS = 0.3;

export class Looks {
  private cache = new WeakMap<PlayerProfile, Look>();

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly cosmetics: (id: string) => CosmeticDef | undefined,
    private dpr: number,
  ) {}

  get(profile: PlayerProfile): Look {
    let look = this.cache.get(profile);
    if (!look) {
      look = this.build(profile);
      this.cache.set(profile, look);
    }
    return look;
  }

  /** Forget everything (device pixel ratio changed, or the label font finished loading). */
  reset(dpr: number): void {
    this.dpr = dpr;
    this.cache = new WeakMap();
  }

  private build(profile: PlayerProfile): Look {
    const color = playerColor(profile.kind, profile.color);
    const bot = profile.kind === 'bot';
    const skin = skinStyle(this.cosmetics(profile.cosmetics.skin), color);
    const headSize = bot ? SIZES.botHead : SIZES.humanHead;
    const trail = pick(TRAILS, this.cosmetics(profile.cosmetics.trail)?.style, 'plain');
    return {
      color,
      skin,
      trail,
      // Fire keeps a hint of the player's colour but reads as flame whatever that colour is.
      trailEdge: trail === 'fire' ? mix(FX_COLORS.flameEdge, color.base, 0.2) : color.base,
      trailCore: trail === 'fire' ? mix(FX_COLORS.flameCore, color.light, 0.15) : color.light,
      capture: pick(CAPTURES, this.cosmetics(profile.cosmetics.capture)?.style, 'wave'),
      kill: pick(KILLS, this.cosmetics(profile.cosmetics.kill)?.style, 'burst'),
      land: landFill(this.ctx, skin, color),
      head: headSprite(skin, color, headSize, hashString(profile.id)),
      headSize,
      label: labelSprite(profile.name, bot, this.dpr),
    };
  }
}

function pick<T extends string>(styles: readonly T[], style: string | undefined, fallback: T): T {
  return styles.find((s) => s === style) ?? fallback;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rounded-square path centred on the origin. */
export function headPath(ctx: CanvasRenderingContext2D | Path2D, s: number): void {
  const h = s / 2;
  const r = s * HEAD_ROUNDNESS;
  ctx.moveTo(-h + r, -h);
  ctx.arcTo(h, -h, h, h, r);
  ctx.arcTo(h, h, -h, h, r);
  ctx.arcTo(-h, h, -h, -h, r);
  ctx.arcTo(-h, -h, h, -h, r);
  ctx.closePath();
}

/**
 * The head's top face: the skin at the same cell scale as the land, a soft top-lit sheen
 * and a light inner rim that gives it the glossy toy look.
 */
function headSprite(skin: SkinStyle, color: PlayerColor, cells: number, seed: number): HTMLCanvasElement {
  const px = HEAD_SPRITE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(px / 2, px / 2);
  ctx.beginPath();
  headPath(ctx, px - 2);
  ctx.save();
  ctx.clip();
  ctx.save();
  const scale = px / cells;
  ctx.translate(-px / 2, -px / 2);
  ctx.scale(scale, scale);
  paintSkin(ctx, skin, color, cells, cells, seed);
  ctx.restore();
  const sheen = ctx.createLinearGradient(0, -px / 2, 0, px / 2);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.06)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-px / 2, -px / 2, px, px);
  ctx.restore();
  ctx.lineWidth = px * 0.05;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  headPath(ctx, px * 0.9);
  ctx.stroke();
  return canvas;
}

const LABEL_FONT_FAMILY = 'Fredoka, system-ui, sans-serif';

function labelSprite(name: string, bot: boolean, dpr: number): HTMLCanvasElement | null {
  const text = name.trim();
  if (!text) return null;
  const fontPx = bot ? 11 : 13;
  const pad = 4;
  const font = `600 ${fontPx}px ${LABEL_FONT_FAMILY}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const height = fontPx + pad * 2;
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = FX_COLORS.labelStroke;
  ctx.strokeText(text, width / 2, height / 2 + 0.5);
  ctx.fillStyle = FX_COLORS.labelText;
  ctx.globalAlpha = bot ? 0.82 : 1;
  ctx.fillText(text, width / 2, height / 2 + 0.5);
  return canvas;
}
