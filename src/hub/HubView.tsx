/** The hub's root view: backdrop, chrome (top bar, screen, tab bar), overlays, game stage and effects. */
import type { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { FEATURED_GAME_ID } from '../games/registry';
import { installNav } from '../shared/ui/nav';
import { Backdrop } from './chrome/Backdrop';
import { FxLayer } from './chrome/FxLayer';
import { TabBar } from './chrome/TabBar';
import { TopBar } from './chrome/TopBar';
import { useHub } from './context';
import { GameStage } from './game/GameStage';
import { Overlays } from './overlays/Overlays';
import { Home } from './screens/home/Home';
import { Locker } from './screens/locker/Locker';
import { Missions } from './screens/missions/Missions';
import { Shop } from './screens/shop/Shop';
import { TABS, type TabId } from './store';
import { cx } from './ui/format';
import './hub.css';

const SCREENS: Readonly<Record<TabId, FunctionComponent>> = {
  home: Home,
  shop: Shop,
  missions: Missions,
  locker: Locker,
};

export function HubView() {
  const { store, launcher, games, feedback, audio } = useHub();
  const root = useRef<HTMLDivElement>(null);
  const gameActive = launcher.gameActive.value;
  const featured = games.find((g) => g.id === FEATURED_GAME_ID);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const uninstallSounds = feedback.installUiSounds(el);
    const uninstallNav = installNav(
      el,
      {
        back: () => store.back(),
        switchTab: (delta) => {
          if (store.overlays.peek().length > 0) return;
          const i = TABS.indexOf(store.tab.peek());
          store.setTab(TABS[(i + delta + TABS.length) % TABS.length]);
          audio.play('whoosh', { volume: 0.35, pitch: 1.3 });
        },
        moved: () => audio.play('hover'),
      },
      () => !launcher.gameActive.peek(),
    );
    return () => {
      uninstallSounds();
      uninstallNav();
    };
  }, [store, launcher, feedback, audio]);

  return (
    <div class="hub" ref={root}>
      {!gameActive && (
        <>
          <Backdrop game={featured} dim={store.tab.value !== 'home'} />
          <div class="hub__chrome" inert={store.overlays.value.length > 0}>
            <TopBar />
            <main class="hub__main">
              <Screen />
            </main>
            <TabBar />
          </div>
          <Overlays />
        </>
      )}
      <GameStage />
      <FxLayer />
    </div>
  );
}

function Screen() {
  const { store } = useHub();
  const tab = store.tab.value;
  const View = SCREENS[tab];
  return (
    <div key={tab} class={cx('screen', store.tabDirection.value > 0 ? 'screen--from-right' : 'screen--from-left')}>
      <View />
    </div>
  );
}
