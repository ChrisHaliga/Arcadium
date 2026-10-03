/** Full-screen states around a match: connecting, no servers, connection lost, and the pause menu. */
import type { JSX } from 'preact';
import { GAME_TITLE } from '../config';
import { HUMAN_COLORS } from '../palette';
import { Button, CoinIcon, Icon } from '../../../shared/ui/kit';
import { formatNumber } from './hooks';
import type { GameUi, MatchMode } from './store';
import './panels.css';

const LOADER_COLORS = [HUMAN_COLORS[0], HUMAN_COLORS[4], HUMAN_COLORS[5]];

/** Nothing takes focus here up front: an extra press of Play must not take the player straight back out. */
export function Connecting({ ui, mode }: { ui: GameUi; mode: MatchMode }): JSX.Element {
  return (
    <div class="lg-screen lg-screen--solid" role="status" data-nav-scope>
      <h1 class="lg-screen__logo">{GAME_TITLE}</h1>
      <div class="lg-loader" aria-hidden="true">
        {LOADER_COLORS.map((c) => (
          <span key={c.name} class="lg-loader__blob" style={{ '--blob': c.base, '--blob-edge': c.dark }} />
        ))}
      </div>
      <p class="lg-screen__text">{mode === 'online' ? 'Finding a match…' : 'Setting up practice…'}</p>
      <Button variant="slate" size="s" icon="home" onClick={() => ui.actions.exitToHub()}>
        Back to hub
      </Button>
    </div>
  );
}

export function ServersDown({ ui }: { ui: GameUi }): JSX.Element {
  return (
    <div class="lg-screen lg-screen--solid" role="alertdialog" aria-label="Servers unreachable" data-nav-scope>
      <div class="lg-screen__badge">
        <Icon name="noSignal" />
      </div>
      <h2 class="lg-screen__title">Can't reach the servers</h2>
      <p class="lg-screen__text">No game server answered. Warm up against bots while they wake up?</p>
      <div class="lg-screen__actions">
        <Button variant="purple" size="l" icon="bot" pulse data-autofocus onClick={() => ui.actions.playOffline()}>
          Practice offline
        </Button>
        <Button variant="blue" icon="refresh" onClick={() => ui.actions.retry()}>
          Try again
        </Button>
        <Button variant="slate" size="s" icon="home" onClick={() => ui.actions.exitToHub()}>
          Back to hub
        </Button>
      </div>
    </div>
  );
}

export function Disconnected({ ui }: { ui: GameUi }): JSX.Element {
  const online = ui.mode.value === 'online';
  return (
    <div class="lg-screen" role="alertdialog" aria-label="Connection lost" data-nav-scope>
      <div class="lg-screen__badge">
        <Icon name="noSignal" />
      </div>
      <h2 class="lg-screen__title">Connection lost</h2>
      <p class="lg-screen__text">Don't worry, the coins from your last life are in your wallet.</p>
      <div class="lg-screen__actions">
        <Button variant="green" size="l" icon="refresh" pulse data-autofocus onClick={() => ui.actions.retry()}>
          Reconnect
        </Button>
        {online && (
          <Button variant="purple" icon="bot" onClick={() => ui.actions.playOffline()}>
            Play offline
          </Button>
        )}
        <Button variant="slate" size="s" icon="home" onClick={() => ui.actions.exitToHub()}>
          Back to hub
        </Button>
      </div>
    </div>
  );
}

export function PauseMenu({ ui }: { ui: GameUi }): JSX.Element {
  const { settings } = ui.services;
  const coins = ui.coins.value;
  const inLife = ui.life.value === 'alive' || ui.life.value === 'down';
  return (
    <div class="lg-modal" role="dialog" aria-label="Paused" data-nav-scope>
      <div class="lg-modal__backdrop" onClick={() => ui.actions.resume()} />
      <div class="lg-panel lg-pause-menu">
        <div class="lg-ribbon">
          <h2 class="lg-ribbon__title">Paused</h2>
        </div>
        <p class="lg-pause-menu__note">
          {ui.frozen.value ? 'The match waits for you.' : "The match keeps going while you're here!"}
        </p>
        <Button variant="green" size="l" icon="play" pulse data-autofocus onClick={() => ui.actions.resume()}>
          Resume
        </Button>
        <div class="lg-toggles">
          <VolumeToggle ui={ui} setting="sfxVolume" label="Sound" on={settings.sfxVolume.value > 0} />
          <VolumeToggle ui={ui} setting="musicVolume" label="Music" on={settings.musicVolume.value > 0} />
        </div>
        <Button variant="pink" icon="home" onClick={() => ui.actions.quit()}>
          Leave match
        </Button>
        {inLife && coins > 0 && (
          <p class="lg-pause-menu__bank">
            Banks <CoinIcon /> {formatNumber(coins)} from this life, without bonus spins
          </p>
        )}
      </div>
    </div>
  );
}

function VolumeToggle({
  ui,
  setting,
  label,
  on,
}: {
  ui: GameUi;
  setting: 'sfxVolume' | 'musicVolume';
  label: string;
  on: boolean;
}): JSX.Element {
  const { settings, audio } = ui.services;
  const toggle = () => {
    const current = settings[setting].peek();
    if (current > 0) {
      ui.restoreVolume[setting] = current;
      settings.set(setting, 0);
    } else {
      settings.set(setting, ui.restoreVolume[setting]);
      if (setting === 'sfxVolume') audio.play('click');
    }
  };
  const icon = setting === 'sfxVolume' ? (on ? 'volume' : 'mute') : on ? 'music' : 'musicOff';
  return (
    <button type="button" class={`lg-toggle${on ? ' is-on' : ''}`} aria-pressed={on} onClick={toggle}>
      <span class="lg-toggle__icon">
        <Icon name={icon} />
      </span>
      <span class="lg-toggle__label">{label}</span>
      <span class="lg-toggle__state">{on ? 'On' : 'Off'}</span>
    </button>
  );
}
