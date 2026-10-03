/** What is waiting for the player right now; drives badges and pulsing buttons. */
import type { ActiveMission } from '../meta';
import { useHub } from './context';

export interface Attention {
  dailyClaimable: boolean;
  heldChests: number;
  claimableMissions: number;
}

export const isClaimable = (m: ActiveMission): boolean => m.complete && !m.claimed;

export function useAttention(): Attention {
  const { meta } = useHub();
  return {
    dailyClaimable: meta.daily.state.value.claimable,
    heldChests: Object.values(meta.chests.held.value).reduce((sum, n) => sum + n, 0),
    claimableMissions:
      meta.missions.daily.value.filter(isClaimable).length + meta.missions.weekly.value.filter(isClaimable).length,
  };
}
