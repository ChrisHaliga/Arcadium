/**
 * Level-up celebration. Its rewards were granted while the match ran; the coins wait off
 * the counter (held when the game closed) and fly in when the player collects them.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { LevelUp as LevelUpEvent } from '../../meta';
import { CHESTS } from '../../meta/config';
import { Button } from '../../shared/ui/kit';
import { useHub } from '../context';
import { RARITY_COLORS } from '../cosmetics/labels';
import { focusFirst, usingKeys } from '../../shared/ui/nav';
import type { Overlay } from '../store';
import { ChestArt } from '../ui/ChestArt';
import { CoinAmount } from '../ui/Coin';
import { openHeldChest } from './chestFlow';
import './level-up.css';

export function LevelUp({ overlay, levelUp }: { overlay: Overlay; levelUp: LevelUpEvent }) {
  const hub = useHub();
  const { store, audio, haptics, particles, coins } = hub;
  const root = useRef<HTMLDivElement>(null);
  const reward = useRef<HTMLSpanElement>(null);
  const collected = useRef(false);

  const collect = () => {
    if (collected.current) return;
    collected.current = true;
    coins.fly(levelUp.coins, reward.current);
  };

  const close = () => {
    collect();
    store.close(overlay);
  };

  useEffect(() => {
    audio.play('levelUp');
    haptics.notify('success');
    particles.rain([...RARITY_COLORS.legendary, '#42e3ff', '#ff4f9a'], 160);
    if (root.current && usingKeys()) focusFirst(root.current);
    const release = store.interceptBack(close);
    return () => {
      release();
      collect();
    };
  }, []);

  return (
    <div ref={root} class="level-up" role="dialog" aria-modal="true" aria-label={`Level ${levelUp.level}`} data-nav-scope>
      <div class="level-up__rays" />
      <div class="level-up__content">
        <div class="level-up__title headline">Level up!</div>
        <div class="level-up__badge">
          <span class="level-up__star" />
          <span class="level-up__number">{levelUp.level}</span>
        </div>
        <div class="level-up__rewards">
          <span class="level-up__reward" ref={reward}>
            <CoinAmount amount={levelUp.coins} />
          </span>
          {levelUp.chest && (
            <span class="level-up__reward">
              <ChestArt type={levelUp.chest} class="level-up__chest" />
              {CHESTS[levelUp.chest].name}
            </span>
          )}
        </div>
        <div class="level-up__actions">
          {levelUp.chest && (
            <Button
              variant="purple"
              icon="chest"
              data-sfx="none"
              onClick={() => {
                const chest = levelUp.chest;
                collect();
                if (chest) openHeldChest(hub, chest, overlay);
              }}
            >
              Open chest
            </Button>
          )}
          <Button variant="gold" size="l" pulse data-autofocus onClick={close}>
            Collect
          </Button>
        </div>
      </div>
    </div>
  );
}
