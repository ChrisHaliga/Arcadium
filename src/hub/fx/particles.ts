/**
 * Celebration particles (confetti, sparks, stars) on one full-screen canvas above the
 * hub. The animation loop only runs while particles are alive, so an idle hub costs nothing.
 */
import { reducedMotion } from './motion';

export type ParticleKind = 'confetti' | 'sparks' | 'stars';

export interface BurstOptions {
  colors: readonly string[];
  kind?: ParticleKind;
  count?: number;
  /** Initial speed in px per second (randomised ±50%). */
  speed?: number;
  /** Centre direction in radians (0 = right, -π/2 = up) and the cone around it. Full circle by default. */
  angle?: number;
  spread?: number;
}

export interface Particles {
  /** Draws into `canvas` from now on; returns a detach function. */
  attach(canvas: HTMLCanvasElement): () => void;
  burst(x: number, y: number, options: BurstOptions): void;
  /** Confetti falling from the top edge across the whole screen. */
  rain(colors: readonly string[], count?: number): void;
}

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  age: number;
  life: number;
  /** Confetti flips around its long axis; this is the phase of that flip. */
  flip: number;
}

const GRAVITY: Record<ParticleKind, number> = { confetti: 520, sparks: 260, stars: 180 };
const DRAG: Record<ParticleKind, number> = { confetti: 2.2, sparks: 1.6, stars: 1.2 };
const MAX_PARTICLES = 600;
/** Reduced motion keeps a hint of celebration without anything flying across the screen. */
const REDUCED_SHARE = 0.15;

export function createParticles(): Particles {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let particles: Particle[] = [];
  let frame = 0;
  let last = 0;
  let dpr = 1;

  const resize = () => {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  };

  const step = (time: number) => {
    frame = 0;
    const g = ctx;
    if (!g || !canvas) return;
    const dt = Math.min(0.05, (time - last) / 1000 || 0.016);
    last = time;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) return false;
      const drag = Math.exp(-DRAG[p.kind] * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY[p.kind] * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.flip += dt * 9;
      draw(g, p);
      return p.y < innerHeight + 40;
    });
    if (particles.length > 0) frame = requestAnimationFrame(step);
  };

  const start = () => {
    if (frame || !ctx) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  const add = (list: Particle[]) => {
    particles = [...particles, ...list].slice(-MAX_PARTICLES);
    start();
  };

  const scaled = (count: number) => Math.max(1, Math.round(count * (reducedMotion.value ? REDUCED_SHARE : 1)));

  return {
    attach(target) {
      canvas = target;
      ctx = target.getContext('2d');
      resize();
      addEventListener('resize', resize);
      return () => {
        removeEventListener('resize', resize);
        cancelAnimationFrame(frame);
        frame = 0;
        canvas = null;
        ctx = null;
        particles = [];
      };
    },
    burst(x, y, options) {
      const kind = options.kind ?? 'confetti';
      const count = scaled(options.count ?? 40);
      const speed = options.speed ?? 700;
      const spread = options.spread ?? Math.PI * 2;
      const angle = options.angle ?? -Math.PI / 2;
      const list: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.5 + Math.random());
        list.push(spawn(kind, x, y, Math.cos(a) * v, Math.sin(a) * v, pick(options.colors)));
      }
      add(list);
    },
    rain(colors, count = 120) {
      const list: Particle[] = [];
      for (let i = 0, n = scaled(count); i < n; i++) {
        const p = spawn('confetti', Math.random() * innerWidth, -20 - Math.random() * innerHeight * 0.5, 0, 0, pick(colors));
        p.vx = (Math.random() - 0.5) * 160;
        p.vy = 120 + Math.random() * 200;
        p.life = 4 + Math.random() * 1.5;
        list.push(p);
      }
      add(list);
    },
  };
}

function spawn(kind: ParticleKind, x: number, y: number, vx: number, vy: number, color: string): Particle {
  const size = kind === 'confetti' ? 7 + Math.random() * 7 : kind === 'stars' ? 8 + Math.random() * 8 : 2.5 + Math.random() * 3.5;
  return {
    kind,
    x,
    y,
    vx,
    vy,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 14,
    size,
    color,
    age: 0,
    life: kind === 'confetti' ? 2.2 + Math.random() : 0.7 + Math.random() * 0.6,
    flip: Math.random() * Math.PI * 2,
  };
}

function draw(ctx: CanvasRenderingContext2D, p: Particle): void {
  const fade = Math.min(1, (p.life - p.age) / 0.35);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  if (p.kind === 'confetti') {
    ctx.scale(Math.cos(p.flip), 1);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  } else if (p.kind === 'sparks') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * (0.6 + fade * 0.4), 0, Math.PI * 2);
    ctx.fill();
  } else {
    star(ctx, p.size * (0.5 + fade * 0.5));
  }
  ctx.restore();
}

/** Four-pointed twinkle star centred on the origin. */
function star(ctx: CanvasRenderingContext2D, r: number): void {
  const inner = r * 0.32;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const len = i % 2 === 0 ? r : inner;
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  ctx.closePath();
  ctx.fill();
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
