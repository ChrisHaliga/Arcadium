/**
 * Illustrations for the game cards. A game that draws its own card art (mountCardArt)
 * gets a live scene in its own style; any other card gets soft glows in its accent
 * colour, so a newly registered game never shows a blank. A playable game's generic card
 * also shows its initial; on a locked card the carousel's lock badge takes that spot.
 */
import type { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { GameModule } from '../../../../shared/game';

type ArtProps = { game: GameModule };

/** The game's own art, mounted into a host element for as long as the card is shown. */
const GameArt: FunctionComponent<ArtProps> = ({ game }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || !game.mountCardArt) return;
    const art = game.mountCardArt(host.current);
    return () => art.dispose();
  }, [game]);
  return <div class="card-art__host" ref={host} />;
};

const GenericArt: FunctionComponent<ArtProps> = ({ game }) => (
  <div class="card-art__generic">
    <span class="card-art__glow card-art__glow--a" />
    <span class="card-art__glow card-art__glow--b" />
    {game.available && <span class="card-art__initial">{game.title.charAt(0)}</span>}
  </div>
);

export function CardArt({ game }: ArtProps) {
  const Art = game.mountCardArt ? GameArt : GenericArt;
  return (
    <div class="card-art" aria-hidden="true">
      <Art game={game} />
    </div>
  );
}
