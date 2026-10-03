/** Player-facing wording for how a life ended. */
import type { LifeEnding } from '../rewards';

export function endingTitle(ending: LifeEnding): string {
  if (ending.kind === 'roundOver') return ending.won ? 'You win!' : 'Round over';
  if (ending.kind === 'left') return 'Match left';
  return ending.cause === 'self' || ending.cause === 'headon' ? 'Crashed!' : 'Knocked out!';
}

export function endingDetail(ending: LifeEnding): string {
  switch (ending.kind) {
    case 'roundOver':
      return ending.won ? 'You took the whole map' : `${ending.winner ?? 'Someone'} took the map`;
    case 'left':
      return 'Your coins are safe';
    case 'death': {
      const killer = ending.killer ?? 'Someone';
      switch (ending.cause) {
        case 'cut':
          return `${killer} cut your trail`;
        case 'self':
          return 'You crossed your own trail';
        case 'headon':
          return 'Head-on crash';
        case 'enclosed':
          return `${killer} trapped you`;
        case 'landlost':
          return `${killer} took the last of your land`;
      }
    }
  }
}
