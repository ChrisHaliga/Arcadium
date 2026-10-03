/**
 * Hub navigation state: which tab is showing, which overlays are stacked on top, and a
 * one-second clock for countdowns. Everything is a signal so any component can read it.
 */
import { batch, signal, type ReadonlySignal } from '@preact/signals';
import type { ChestResult, ChestType, LevelUp } from '../meta';

export type TabId = 'home' | 'shop' | 'missions' | 'locker';

export const TABS: readonly TabId[] = ['home', 'shop', 'missions', 'locker'];

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Overlay =
  | { kind: 'daily' }
  | { kind: 'settings' }
  | { kind: 'buyItem'; itemId: string }
  | { kind: 'buyChest'; chest: ChestType }
  | { kind: 'odds'; chest: ChestType; anchor: AnchorRect }
  | { kind: 'chest'; result: ChestResult }
  | { kind: 'levelUp'; levelUp: LevelUp };

export interface HubStore {
  readonly tab: ReadonlySignal<TabId>;
  /** +1 when the last tab change moved right in the tab bar, -1 when it moved left. */
  readonly tabDirection: ReadonlySignal<1 | -1>;
  readonly overlays: ReadonlySignal<readonly Overlay[]>;
  /** Epoch ms, refreshed every second while the hub runs. */
  readonly now: ReadonlySignal<number>;
  /** Game id selected in the home carousel. */
  readonly selectedGame: ReadonlySignal<string>;
  setTab(tab: TabId): void;
  selectGame(id: string): void;
  open(overlay: Overlay): void;
  /** Closes `overlay`, or the top overlay when none is given. */
  close(overlay?: Overlay): void;
  /** Swaps `current` for `next` in place, e.g. a purchase confirmation turning into the chest opening. */
  replace(current: Overlay, next: Overlay): void;
  /**
   * Lets an overlay take over Back (Escape, gamepad B, Android back), e.g. to skip its
   * animation instead of closing. The latest registration wins; returns an unregister function.
   */
  interceptBack(handler: () => void): () => void;
  /** Back: an interceptor, else close the top overlay, else return to Home. False when there was nothing to undo. */
  back(): boolean;
  tick(now: number): void;
}

export function createStore(initialGame: string): HubStore {
  const tab = signal<TabId>('home');
  const tabDirection = signal<1 | -1>(1);
  const overlays = signal<readonly Overlay[]>([]);
  const now = signal(Date.now());
  const selectedGame = signal(initialGame);
  const interceptors: (() => void)[] = [];

  const setTab = (next: TabId) => {
    if (next === tab.value) return;
    batch(() => {
      tabDirection.value = TABS.indexOf(next) > TABS.indexOf(tab.value) ? 1 : -1;
      tab.value = next;
    });
  };

  const close = (overlay?: Overlay) => {
    const list = overlays.value;
    const index = overlay ? list.lastIndexOf(overlay) : list.length - 1;
    if (index >= 0) overlays.value = list.filter((_, i) => i !== index);
  };

  return {
    tab,
    tabDirection,
    overlays,
    now,
    selectedGame,
    setTab,
    selectGame(id) {
      selectedGame.value = id;
    },
    open(overlay) {
      overlays.value = [...overlays.value, overlay];
    },
    close,
    replace(current, next) {
      overlays.value = overlays.value.map((o) => (o === current ? next : o));
    },
    interceptBack(handler) {
      interceptors.push(handler);
      return () => {
        const index = interceptors.lastIndexOf(handler);
        if (index >= 0) interceptors.splice(index, 1);
      };
    },
    back() {
      const intercept = interceptors.at(-1);
      if (intercept) intercept();
      else if (overlays.value.length > 0) close();
      else if (tab.value !== 'home') setTab('home');
      else return false;
      return true;
    },
    tick(time) {
      now.value = time;
    },
  };
}
