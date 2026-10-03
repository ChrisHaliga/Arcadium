/** Platform layer: everything that differs between the web, Electron (Steam) and Capacitor (iOS/Android) builds. */
export { createStorage } from './storage';
export { createHaptics } from './haptics';
export { platformInfo, isNativeMobile, type PlatformInfo, type PlatformKind } from './info';
export {
  onPause,
  onResume,
  onBackButton,
  canFullscreen,
  toggleFullscreen,
  exitApp,
  type PauseHandler,
} from './lifecycle';
