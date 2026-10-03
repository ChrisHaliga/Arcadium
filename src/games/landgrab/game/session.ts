/**
 * A launched Landgrab session: the canvas and overlay layers, connecting (online with an
 * offer to practise offline when no server answers, or offline straight away), swapping
 * matches on retry, and pausing. Everything it creates goes away on dispose.
 */
import { h, render } from 'preact';
import type { Disposable, LaunchOptions } from '../../../shared/game';
import type { GameServices } from '../../../shared/services';
import { App } from '../ui/App';
import { installOverlayNav } from '../ui/overlayNav';
import { GameUi, type MatchMode } from '../ui/store';
import { connect, helloProfile, type Connection } from './connect';
import { Match } from './match';

export function launchSession(host: HTMLElement, services: GameServices, opts: LaunchOptions): Disposable {
  const root = document.createElement('div');
  root.className = 'lg-game';
  const canvas = document.createElement('canvas');
  canvas.className = 'lg-canvas';
  const overlay = document.createElement('div');
  overlay.className = 'lg-ui';
  root.append(canvas, overlay);
  host.append(root);

  let match: Match | null = null;
  let connection: Connection | null = null;
  let mode: MatchMode = opts.mode;
  /** Bumped per connection attempt, so a slow attempt that was abandoned can't take over. */
  let attempt = 0;
  let disposed = false;

  const ui = new GameUi(
    {
      playAgain: () => match?.playAgain(),
      exitToHub: () => services.exit(),
      revive: () => match?.revive(),
      declineRevive: () => match?.declineRevive(),
      pause: () => {
        if (setPaused(true)) services.audio.play('click');
      },
      resume: () => {
        setPaused(false);
      },
      quit: () => {
        match?.bankLife();
        services.exit();
      },
      retry: () => void start(mode),
      playOffline: () => void start('offline'),
    },
    services,
  );
  render(h(App, { ui }), overlay);
  // Installed before any match creates its input, so the menus see a key before steering does.
  const uninstallNav = installOverlayNav(overlay, ui);

  /**
   * Opens or closes the pause menu. Offline, the match holds still behind it; online the
   * others play on. False when there was nothing to change.
   */
  function setPaused(paused: boolean): boolean {
    if (!match || ui.screen.peek().kind !== 'match' || ui.paused.peek() === paused) return false;
    ui.paused.value = paused;
    if (connection?.setPaused) {
      connection.setPaused(paused);
      ui.freeze(paused);
    }
    return true;
  }

  // Going to the background pauses an offline match, so it waits for the player to come back.
  const onVisibility = () => {
    if (document.hidden && connection?.setPaused) setPaused(true);
  };
  document.addEventListener('visibilitychange', onVisibility);

  function teardown(): void {
    match?.dispose();
    match = null;
    connection?.dispose();
    connection = null;
  }

  async function start(next: MatchMode): Promise<void> {
    teardown();
    mode = next;
    const id = ++attempt;
    ui.resetMatch();
    ui.mode.value = next;
    ui.screen.value = { kind: 'connecting', mode: next };
    let joined: Connection;
    try {
      joined = await connect(next, helloProfile(services));
    } catch (error) {
      if (disposed || id !== attempt) return;
      if (next === 'offline') console.error('[landgrab] the offline match did not start', error);
      ui.screen.value = next === 'online' ? { kind: 'serversDown' } : { kind: 'disconnected', reason: String(error) };
      return;
    }
    if (disposed || id !== attempt) {
      joined.dispose();
      return;
    }
    connection = joined;
    match = new Match({
      client: joined.client,
      canvas,
      ui,
      services,
      onDisconnect: (reason) => {
        if (id === attempt) ui.screen.value = { kind: 'disconnected', reason };
      },
    });
    ui.screen.value = { kind: 'match' };
  }

  void start(opts.mode);

  return {
    dispose() {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      uninstallNav();
      teardown();
      ui.dispose();
      render(null, overlay);
      root.remove();
    },
  };
}
