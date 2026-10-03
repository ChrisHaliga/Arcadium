/** Top-most layers for celebration particles, flying coins and toasts. */
import { useEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from '../../shared/ui/kit';
import { useHub } from '../context';
import type { ToastTone } from '../fx/toasts';
import './fx.css';

const TOAST_ICONS: Record<ToastTone, IconName> = { error: 'close', success: 'check', info: 'info' };

export function FxLayer() {
  const { particles, coins, toasts } = useHub();
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvas.current || !layer.current) return;
    const detachParticles = particles.attach(canvas.current);
    const detachCoins = coins.attach(layer.current);
    return () => {
      detachParticles();
      detachCoins();
    };
  }, [particles, coins]);

  return (
    <>
      <canvas ref={canvas} class="fx-particles" aria-hidden="true" />
      <div ref={layer} class="fx-coins" aria-hidden="true" />
      <div class="toasts" role="status" aria-live="polite">
        {toasts.list.value.map((t) => (
          <div key={t.id} class={`toast toast--${t.tone}`}>
            <span class="toast__icon">
              <Icon name={TOAST_ICONS[t.tone]} />
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
