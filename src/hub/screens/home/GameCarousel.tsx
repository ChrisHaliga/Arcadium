/**
 * The featured-games carousel: the selected card sits front and centre, its neighbours
 * peek in from the sides. Swipe, tap a side card or use the arrows; with a keyboard or
 * pad, only the selected card takes focus and left/right flip through the games.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule } from '../../../shared/game';
import { Icon } from '../../../shared/ui/kit';
import { useHub } from '../../context';
import { cx } from '../../ui/format';
import { CardArt } from './art/CardArt';

interface CarouselProps {
  games: readonly GameModule[];
  selectedId: string;
  onSelect(id: string): void;
}

const SWIPE_PX = 45;
const DRAG_START_PX = 8;

export function GameCarousel({ games, selectedId, onSelect }: CarouselProps) {
  const { audio } = useHub();
  const index = Math.max(0, games.findIndex((g) => g.id === selectedId));
  const [drag, setDrag] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  /** Set after a drag so the click that ends it doesn't also select a card. */
  const dragged = useRef(false);

  const select = (next: number) => {
    const clamped = Math.max(0, Math.min(games.length - 1, next));
    if (clamped === index) return;
    audio.play('whoosh', { volume: 0.3, pitch: 1.6 });
    onSelect(games[clamped].id);
  };

  // Flipping cards from the keyboard keeps focus on whichever card is now in front.
  useEffect(() => {
    const el = track.current;
    if (!el?.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>('.game-card.is-selected')?.focus({ preventScroll: true });
  }, [index]);

  const flip = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const next = index + delta;
    // At either end the key falls through to normal focus movement (to the rail or the Play button).
    if (delta === 0 || next < 0 || next >= games.length) return;
    e.preventDefault();
    select(next);
  };

  // Drags are tracked on the window so a swipe that leaves the carousel still ends cleanly.
  const startDrag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const cardWidth = track.current?.querySelector<HTMLElement>('.game-card')?.offsetWidth ?? 300;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > DRAG_START_PX) dragged.current = true;
      if (dragged.current) setDrag(Math.max(-1.2, Math.min(1.2, dx / cardWidth)));
    };
    const end = (ev: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      const dx = ev.clientX - startX;
      setDrag(0);
      if (dragged.current && Math.abs(dx) > SWIPE_PX) select(index + (dx < 0 ? 1 : -1));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  };

  return (
    <div class="carousel">
      <div class={cx('carousel__track', drag !== 0 && 'is-dragging')} ref={track} onPointerDown={startDrag}>
        {games.map((game, i) => {
          const offset = i - index + drag;
          const distance = Math.abs(offset);
          const scale = 1 - Math.min(distance, 1.5) * 0.14;
          const selected = i === index;
          return (
            <button
              key={game.id}
              type="button"
              class={cx('game-card', selected && 'is-selected', !game.available && 'is-locked')}
              style={{
                '--accent': game.accent,
                // --card-step (CSS) is the distance between card centres as a share of a card's width.
                transform: `translate(-50%, -50%) translateX(calc(${offset} * var(--card-step) * 100%)) scale(${scale})`,
                zIndex: 10 - Math.round(distance),
                opacity: distance > 1.7 ? 0 : 1,
              }}
              tabIndex={selected ? 0 : -1}
              aria-current={selected}
              aria-label={`${game.title}${game.available ? '' : ', coming soon'}`}
              onClick={() => {
                if (!dragged.current) select(i);
              }}
              onKeyDown={selected ? flip : undefined}
            >
              <CardArt game={game} />
              <span class="game-card__shade" />
              {game.available ? (
                <span class="game-card__chip">
                  <Icon name="globe" /> Online
                </span>
              ) : (
                <>
                  <span class="game-card__lock">
                    <Icon name="lock" />
                  </span>
                  <span class="game-card__soon">Coming soon</span>
                </>
              )}
              <span class="game-card__info">
                <span class="game-card__title headline">{game.title}</span>
                <span class="game-card__tagline">{game.tagline}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        class="carousel__arrow carousel__arrow--prev"
        aria-label="Previous game"
        disabled={index === 0}
        tabIndex={-1}
        onClick={() => select(index - 1)}
      >
        <Icon name="chevronLeft" />
      </button>
      <button
        type="button"
        class="carousel__arrow carousel__arrow--next"
        aria-label="Next game"
        disabled={index === games.length - 1}
        tabIndex={-1}
        onClick={() => select(index + 1)}
      >
        <Icon name="chevronRight" />
      </button>
      <div class="carousel__dots" aria-hidden="true">
        {games.map((game, i) => (
          <span key={game.id} class={cx('carousel__dot', i === index && 'is-active')} />
        ))}
      </div>
    </div>
  );
}
