/** Bottom tab bar. The active tab lifts out of the bar; badges count what's waiting on each screen. */
import { Icon, type IconName } from '../../shared/ui/kit';
import { useHub } from '../context';
import { useAttention } from '../attention';
import { TABS, type TabId } from '../store';
import { Badge } from '../ui/Badge';
import { cx } from '../ui/format';
import './tabbar.css';

const TAB_INFO: Record<TabId, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home' },
  shop: { label: 'Shop', icon: 'shop' },
  missions: { label: 'Missions', icon: 'missions' },
  locker: { label: 'Locker', icon: 'locker' },
};

export function TabBar() {
  const { store, audio } = useHub();
  const attention = useAttention();
  const active = store.tab.value;
  const counts: Record<TabId, number> = {
    home: attention.dailyClaimable ? 1 : 0,
    shop: attention.heldChests,
    missions: attention.claimableMissions,
    locker: 0,
  };

  return (
    <nav class="tabbar" role="tablist" aria-label="Hub">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === active}
          class={cx('tabbar__tab', tab === active && 'is-active')}
          onClick={() => {
            if (tab !== active) audio.play('whoosh', { volume: 0.35, pitch: 1.3 });
            store.setTab(tab);
          }}
        >
          <span class="tabbar__bubble">
            <Icon name={TAB_INFO[tab].icon} class="tabbar__icon" />
            <Badge count={counts[tab]} />
          </span>
          <span class="tabbar__label">{TAB_INFO[tab].label}</span>
        </button>
      ))}
    </nav>
  );
}
