/**
 * A cosmetic in the player's colour. The game it belongs to draws it with its own
 * renderer when it can (renderCosmeticPreview), so it looks exactly as it does in play;
 * otherwise it shows as a soft swatch of the colour with the kind's icon.
 */
import { useEffect, useRef } from 'preact/hooks';
import { playerColor } from '../../games/registry';
import type { GameModule } from '../../shared/game';
import type { CosmeticDef } from '../../shared/services';
import { Icon } from '../../shared/ui/kit';
import { useHub } from '../context';
import { cx } from '../ui/format';
import { KIND_INFO } from './labels';

interface PreviewProps {
  def: CosmeticDef;
  class?: string;
}

export function CosmeticPreview({ def, class: className }: PreviewProps) {
  const { meta, games } = useHub();
  const color = meta.services.profile.color.value;
  const game = games.find((g) => g.id === def.gameId);
  return game?.renderCosmeticPreview ? (
    <GamePreview game={game} def={def} color={color} class={className} />
  ) : (
    <SwatchPreview def={def} color={color} class={className} />
  );
}

function GamePreview({ game, def, color, class: className }: PreviewProps & { game: GameModule; color: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !game.renderCosmeticPreview) return;
    const preview = game.renderCosmeticPreview(canvas.current, def, color);
    return () => preview.dispose();
    // A preview depends on which item and colour it shows, not on the def object's identity.
  }, [game, def.id, color]);
  return <canvas ref={canvas} class={cx('cosmetic-preview', className)} aria-hidden="true" />;
}

function SwatchPreview({ def, color, class: className }: PreviewProps & { color: number }) {
  const c = playerColor(color);
  return (
    <span
      class={cx('cosmetic-preview', 'cosmetic-preview--swatch', className)}
      style={{ '--c': c.base, '--c-light': c.light, '--c-dark': c.dark }}
      aria-hidden="true"
    >
      <Icon name={KIND_INFO[def.kind].icon} />
    </span>
  );
}
