/**
 * What plays behind the menus: the featured game's attract match when it has one,
 * otherwise a slow night-sky scene of glows and drifting territory tiles.
 */
import { useEffect, useRef } from 'preact/hooks';
import { PLAYER_COLORS } from '../../games/registry';
import type { GameModule } from '../../shared/game';
import { cx } from '../ui/format';
import './backdrop.css';

interface Tile {
  left: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
  turn: number;
}

/** Fixed pseudo-random layout so the scene looks the same on every visit. */
const TILES: readonly Tile[] = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: r(1) * 100,
    size: 0.9 + r(2) * 2.6,
    duration: 22 + r(3) * 26,
    delay: -r(4) * 40,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length].base,
    turn: (r(5) - 0.5) * 540,
  };
});

export function Backdrop({ game, dim }: { game: GameModule | undefined; dim: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const attract = game?.mountAttract;

  useEffect(() => {
    if (!attract || !host.current) return;
    const mounted = attract.call(game, host.current);
    return () => mounted.dispose();
  }, [game, attract]);

  return (
    <div class={cx('backdrop', dim && 'backdrop--dim')} aria-hidden="true">
      {attract ? (
        <div class="backdrop__attract" ref={host} />
      ) : (
        <div class="backdrop__scene">
          <div class="backdrop__glow backdrop__glow--a" />
          <div class="backdrop__glow backdrop__glow--b" />
          <div class="backdrop__glow backdrop__glow--c" />
          <div class="backdrop__grid" />
          {TILES.map((t, i) => (
            <span
              key={i}
              class="backdrop__tile"
              style={{
                left: `${t.left}%`,
                width: `${t.size}rem`,
                animationDuration: `${t.duration}s`,
                animationDelay: `${t.delay}s`,
                '--tile': t.color,
                '--turn': `${t.turn}deg`,
              }}
            />
          ))}
        </div>
      )}
      <div class="backdrop__vignette" />
    </div>
  );
}
