/**
 * Heads: rounded glossy blocks turned to the direction of travel, sitting on a darker lip
 * like the territory slabs, with big eyes looking where they go. Bots are smaller and
 * muted (their palette), so humans stand out. Names float above in screen space.
 */
import type { Camera } from './camera';
import { clamp, easeOutBack, TAU } from './geometry';
import { headPath, type Look } from './looks';
import { softSprite } from './sprites';
import { FX_COLORS, SIZES } from './theme';

const SPAWN_POP_SECONDS = 0.38;
const CONTACT_SHADOW = 'rgba(27, 20, 64, 0.22)';

/** Head scale for the spawn pop: grows from nothing with a little overshoot. */
export function spawnScale(clock: number, bornAt: number): number {
  const t = clamp((clock - bornAt) / SPAWN_POP_SECONDS, 0, 1);
  return t >= 1 ? 1 : Math.max(0, easeOutBack(t));
}

/**
 * Draws one head at (x, y) cells facing `angle` (canvas radians, 0 = up). `seed` staggers
 * blinking between players.
 */
export function drawHead(
  ctx: CanvasRenderingContext2D,
  look: Look,
  x: number,
  y: number,
  angle: number,
  scale: number,
  clock: number,
  seed: number,
): void {
  const s = look.headSize * scale;
  if (s <= 0.05) return;
  const lip = SIZES.headLip * scale;

  if (look.skin.name === 'glow') {
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(clock * 4 + seed);
    const g = s * 1.9;
    ctx.drawImage(softSprite(look.color.light), x - g, y - g, g * 2, g * 2);
    ctx.globalAlpha = 1;
  }
  // Contact shadow, then the lip (screen-down: the light comes from above), then the top.
  ctx.fillStyle = CONTACT_SHADOW;
  ctx.beginPath();
  ctx.ellipse(x, y + lip + s * 0.36, s * 0.62, s * 0.26, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y + lip);
  ctx.rotate(angle);
  ctx.fillStyle = look.color.dark;
  ctx.beginPath();
  headPath(ctx, s);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(look.head, -s / 2, -s / 2, s, s);
  ctx.restore();

  // A glint that stays top-left whichever way the head turns: the light is fixed, the
  // head rotates. It sits inside the inscribed circle, so it never pokes past a corner.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.21, y - s * 0.23, s * 0.12, s * 0.06, -0.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  drawEyes(ctx, x, y, angle, s, clock, seed);
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, s: number, clock: number, seed: number): void {
  const fx = Math.sin(angle);
  const fy = -Math.cos(angle);
  // A blink of ~0.13 s every few seconds, out of step between players.
  const phase = (clock + seed * 0.37) % 3.7;
  const open = phase < 0.13 ? Math.abs(phase / 0.065 - 1) : 1;
  const r = s * 0.155;
  const pupil = s * 0.085;
  for (let side = -1; side <= 1; side += 2) {
    const ex = x + fx * s * 0.13 - fy * side * s * 0.2;
    const ey = y + fy * s * 0.13 + fx * side * s * 0.2;
    ctx.fillStyle = FX_COLORS.eyeWhite;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r, Math.max(0.02, r * open), angle, 0, TAU);
    ctx.fill();
    if (open < 0.35) continue;
    ctx.fillStyle = FX_COLORS.pupil;
    ctx.beginPath();
    ctx.arc(ex + fx * r * 0.42, ey + fy * r * 0.42, pupil, 0, TAU);
    ctx.fill();
    ctx.fillStyle = FX_COLORS.eyeWhite;
    ctx.beginPath();
    ctx.arc(ex + fx * r * 0.42 - pupil * 0.35, ey + fy * r * 0.42 - pupil * 0.35, pupil * 0.32, 0, TAU);
    ctx.fill();
  }
}

/** The player's name centred above the head, in CSS pixel space. */
export function drawLabel(ctx: CanvasRenderingContext2D, camera: Camera, look: Look, x: number, y: number, scale: number, dpr: number): void {
  const label = look.label;
  if (!label || scale < 0.5) return;
  const w = label.width / dpr;
  const h = label.height / dpr;
  const sx = camera.screenX(x);
  const sy = camera.screenY(y - (look.headSize * scale) / 2) - 3;
  ctx.globalAlpha = clamp((scale - 0.5) * 2, 0, 1);
  ctx.drawImage(label, sx - w / 2, sy - h, w, h);
  ctx.globalAlpha = 1;
}
