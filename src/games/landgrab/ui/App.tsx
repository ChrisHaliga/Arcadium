/** The in-match overlay root: picks the full-screen state or the HUD and the modals on top of the map. */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
// Before the components, so their own stylesheets can refine the shared panel rules.
import '../../../shared/ui/kit/tokens.css';
import '../../../shared/ui/kit/motion.css';
import './base.css';
import type { JSX } from 'preact';
import { Callouts, KillFlash } from './Callouts';
import { Hud } from './Hud';
import { Results } from './Results';
import { RoundBanner } from './RoundBanner';
import { Connecting, Disconnected, PauseMenu, ServersDown } from './Screens';
import { SecondChance } from './SecondChance';
import type { GameUi } from './store';

export function App({ ui }: { ui: GameUi }): JSX.Element {
  const screen = ui.screen.value;
  switch (screen.kind) {
    case 'connecting':
      return <Connecting ui={ui} mode={screen.mode} />;
    case 'serversDown':
      return <ServersDown ui={ui} />;
    case 'disconnected':
      return <Disconnected ui={ui} />;
    case 'match':
      return <Match ui={ui} />;
  }
}

function Match({ ui }: { ui: GameUi }): JSX.Element {
  const offer = ui.secondChance.value;
  const results = ui.results.value;
  const round = ui.round.value;
  const waiting = ui.life.value === 'waiting' && round === null;
  return (
    <>
      <Hud ui={ui} />
      <Callouts ui={ui} />
      <KillFlash ui={ui} />
      {waiting && <div class="lg-get-ready">Get ready…</div>}
      {offer && <SecondChance ui={ui} offer={offer} />}
      {results && <Results key={results.id} ui={ui} view={results} />}
      {round && <RoundBanner key={round.nextAt} ui={ui} round={round} />}
      {ui.paused.value && <PauseMenu ui={ui} />}
    </>
  );
}
