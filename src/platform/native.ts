/**
 * The bridge desktop/preload.cjs exposes as `window.arcadiumNative` inside the Electron
 * app. It only exists there, so its presence is also how the web build knows it is
 * running on desktop. Keep this file and preload.cjs in sync.
 */

export interface ArcadiumNative {
  readonly platform: {
    /** Node's process.platform of the desktop host. */
    readonly os: string;
    /** Steam Deck / SteamOS: the window starts fullscreen and a gamepad is the main input. */
    readonly steamDeck: boolean;
  };
  /** Files under the app's userData/saves folder, which Steam Auto-Cloud syncs. */
  readonly storage: {
    load(key: string): Promise<string | null>;
    save(key: string, value: string): Promise<void>;
  };
  readonly app: {
    toggleFullscreen(): void;
    /** Closes the window, which still runs the close handler first. */
    quit(): void;
    /**
     * Called when the window is about to close; the window waits (a few seconds at most)
     * for the returned promise so pending saves can land.
     */
    setCloseHandler(handler: () => Promise<void>): void;
  };
}

declare global {
  interface Window {
    arcadiumNative?: ArcadiumNative;
  }
}

export function nativeBridge(): ArcadiumNative | null {
  return typeof window === 'undefined' ? null : (window.arcadiumNative ?? null);
}
