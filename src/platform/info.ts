/** Which build the app is running as, detected once at first use. */
import { Capacitor } from '@capacitor/core';
import { nativeBridge } from './native';

export type PlatformKind = 'web' | 'electron' | 'ios' | 'android';

export interface PlatformInfo {
  readonly kind: PlatformKind;
  /** The primary pointer is a finger, so the UI should show swipe hints and bigger targets. */
  readonly touch: boolean;
  /** Desktop build on a Steam Deck / SteamOS, where a gamepad is the main input. */
  readonly steamDeck: boolean;
}

let detected: PlatformInfo | undefined;

export function platformInfo(): PlatformInfo {
  detected ??= Object.freeze(detect());
  return detected;
}

/** iOS or Android app built with Capacitor. */
export function isNativeMobile(): boolean {
  const { kind } = platformInfo();
  return kind === 'ios' || kind === 'android';
}

function detect(): PlatformInfo {
  const bridge = nativeBridge();
  if (bridge) return { kind: 'electron', touch: coarsePointer(), steamDeck: bridge.platform.steamDeck };
  const native = Capacitor.getPlatform();
  if (native === 'ios' || native === 'android') return { kind: native, touch: true, steamDeck: false };
  return { kind: 'web', touch: coarsePointer(), steamDeck: false };
}

function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
