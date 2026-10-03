import type { CapacitorConfig } from '@capacitor/cli';

/** Matches the app's background, so launch and overscroll never flash white. */
const BACKGROUND = '#1b1440';

const config: CapacitorConfig = {
  // Placeholder: change to a reverse-domain you own before the first store upload.
  // Stores treat it as the app's permanent identity, so it can't change after release.
  appId: 'com.arcadium.app',
  appName: 'Arcadium',
  webDir: 'dist',
  backgroundColor: BACKGROUND,
  zoomEnabled: false,
  // Native log output only in debug builds; release builds stay quiet.
  loggingBehavior: 'debug',
  ios: {
    // The game draws edge to edge and pads its UI with env(safe-area-inset-*).
    contentInset: 'never',
    // Swipes steer the player; the page must never rubber-band.
    scrollEnabled: false,
    // Long presses are gameplay, not link previews.
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    // Play Store uploads are app bundles.
    buildOptions: { releaseType: 'AAB' },
  },
  plugins: {
    SystemBars: {
      // Exposes safe-area insets to CSS on Android too, so one layout works on both platforms.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light status-bar icons over the dark game, for when the player swipes the bars back in.
      style: 'DARK',
      // Fullscreen game: status and navigation bars start hidden.
      hidden: true,
    },
  },
};

export default config;
