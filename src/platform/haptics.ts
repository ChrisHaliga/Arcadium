/**
 * Haptic feedback on whatever the player is holding: the phone's taptic engine on
 * iOS/Android, a gamepad's rumble motors on desktop (and in browsers that expose them),
 * or the Vibration API as a last resort on mobile browsers.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { HapticsService, SettingsService } from '../shared/services';
import { isNativeMobile } from './info';

type Strength = Parameters<HapticsService['impact']>[0];
type Notice = Parameters<HapticsService['notify']>[0];

/** One buzz of a pattern. Times in ms; magnitudes 0..1 for the heavy and light rumble motors. */
interface Pulse {
  delay: number;
  duration: number;
  strong: number;
  weak: number;
}

const IMPACTS: Record<Strength, readonly Pulse[]> = {
  light: [{ delay: 0, duration: 15, strong: 0, weak: 0.35 }],
  medium: [{ delay: 0, duration: 30, strong: 0.4, weak: 0.7 }],
  heavy: [{ delay: 0, duration: 60, strong: 1, weak: 1 }],
};

const NOTICES: Record<Notice, readonly Pulse[]> = {
  success: [
    { delay: 0, duration: 25, strong: 0.2, weak: 0.6 },
    { delay: 90, duration: 40, strong: 0.5, weak: 0.9 },
  ],
  warning: [
    { delay: 0, duration: 45, strong: 0.6, weak: 0.5 },
    { delay: 140, duration: 45, strong: 0.6, weak: 0.5 },
  ],
  error: [
    { delay: 0, duration: 60, strong: 1, weak: 0.8 },
    { delay: 110, duration: 60, strong: 1, weak: 0.8 },
    { delay: 220, duration: 60, strong: 1, weak: 0.8 },
  ],
};

const NATIVE_IMPACT: Record<Strength, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const NATIVE_NOTICE: Record<Notice, NotificationType> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

/** Games fire impacts per coin or per captured cell; closer than this they blur into a buzz. */
const MIN_IMPACT_GAP_MS = 40;

/** Rumble motors need this long to spin up, so shorter phone-style taps would be lost. */
const MIN_RUMBLE_MS = 50;

export function createHaptics(settings: SettingsService): HapticsService {
  const native = isNativeMobile();
  let lastImpact = -Infinity;

  // peek(): a haptic fired from inside a signal effect must not subscribe it to the setting.
  const enabled = () => settings.haptics.peek();

  return {
    impact(strength) {
      if (!enabled()) return;
      const now = performance.now();
      if (now - lastImpact < MIN_IMPACT_GAP_MS) return;
      lastImpact = now;
      if (native) Haptics.impact({ style: NATIVE_IMPACT[strength] }).catch(ignore);
      else playPattern(IMPACTS[strength]);
    },
    notify(kind) {
      if (!enabled()) return;
      if (native) Haptics.notification({ type: NATIVE_NOTICE[kind] }).catch(ignore);
      else playPattern(NOTICES[kind]);
    },
  };
}

function playPattern(pulses: readonly Pulse[]): void {
  const pad = activeGamepad();
  if (pad) {
    // A new effect cancels the one playing, so each pulse is started on its own.
    for (const pulse of pulses) setTimeout(() => rumble(pad, pulse), pulse.delay);
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(vibratePattern(pulses));
  }
}

function rumble(pad: Gamepad, pulse: Pulse): void {
  pad.vibrationActuator
    .playEffect('dual-rumble', {
      duration: Math.max(pulse.duration, MIN_RUMBLE_MS),
      strongMagnitude: pulse.strong,
      weakMagnitude: pulse.weak,
    })
    .catch(ignore);
}

/** The connected pad that was used most recently, if it can rumble. */
function activeGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  let best: Gamepad | null = null;
  for (const pad of navigator.getGamepads()) {
    // vibrationActuator is typed as always present but is null on pads without motors.
    if (!pad?.connected || !pad.vibrationActuator) continue;
    if (!best || pad.timestamp > best.timestamp) best = pad;
  }
  return best;
}

/** [buzz, pause, buzz, ...] in ms, as navigator.vibrate expects. */
function vibratePattern(pulses: readonly Pulse[]): number[] {
  const pattern: number[] = [];
  let at = 0;
  for (const pulse of pulses) {
    if (pattern.length > 0) pattern.push(Math.max(0, pulse.delay - at));
    pattern.push(pulse.duration);
    at = pulse.delay + pulse.duration;
  }
  return pattern;
}

function ignore(): void {}
