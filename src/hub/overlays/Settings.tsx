/** Settings: volumes, haptics, screen shake, fullscreen / quit where the platform allows, and credits. */
import type { ComponentChildren } from 'preact';
import { canFullscreen, exitApp, platformInfo, toggleFullscreen } from '../../platform';
import { Button, Icon, type IconName } from '../../shared/ui/kit';
import { useHub } from '../context';
import type { Overlay } from '../store';
import { Modal } from '../ui/Modal';
import { Slider } from '../ui/Slider';
import { Switch } from '../ui/Switch';
import { version } from '../../../package.json';
import './settings.css';

export function Settings({ overlay }: { overlay: Overlay }) {
  const { meta, store, audio, haptics } = useHub();
  const { settings } = meta.services;
  const platform = platformInfo().kind;
  const canQuit = platform === 'electron' || platform === 'android';

  return (
    <Modal title="Settings" tone="blue" size="m" onClose={() => store.close(overlay)}>
      <div class="settings">
        <Row icon="volume" label="Sound effects">
          <Slider
            label="Sound effects volume"
            value={settings.sfxVolume.value}
            onInput={(v) => settings.set('sfxVolume', v)}
            onCommit={() => audio.play('coin')}
          />
        </Row>
        <Row icon="music" label="Music">
          <Slider label="Music volume" value={settings.musicVolume.value} onInput={(v) => settings.set('musicVolume', v)} />
        </Row>
        <Row icon="vibrate" label="Haptics">
          <Switch
            label="Haptics"
            checked={settings.haptics.value}
            onChange={(on) => {
              settings.set('haptics', on);
              if (on) haptics.impact('medium');
            }}
          />
        </Row>
        <Row icon="shake" label="Screen shake">
          <Switch label="Screen shake" checked={settings.screenShake.value} onChange={(on) => settings.set('screenShake', on)} />
        </Row>
        {(canFullscreen() || canQuit) && (
          <div class="settings__actions">
            {canFullscreen() && (
              <Button variant="slate" icon="fullscreen" onClick={toggleFullscreen}>
                Fullscreen
              </Button>
            )}
            {canQuit && (
              <Button variant="pink" icon="power" onClick={exitApp}>
                Quit game
              </Button>
            )}
          </div>
        )}
        <footer class="settings__credits">
          <strong>Arcadium</strong> v{version}
          <span>Sounds and music are generated live. Made with Preact, WebAudio and a lot of coins.</span>
          <span class="settings__id">Player ID {meta.services.profile.playerId}</span>
        </footer>
      </div>
    </Modal>
  );
}

function Row({ icon, label, children }: { icon: IconName; label: string; children: ComponentChildren }) {
  return (
    <div class="settings__row">
      <span class="settings__label">
        <span class="settings__icon">
          <Icon name={icon} />
        </span>
        {label}
      </span>
      <span class="settings__control">{children}</span>
    </div>
  );
}
