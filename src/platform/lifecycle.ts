/**
 * App lifecycle across targets: going to the background and back, the Android back
 * button, fullscreen and quitting.
 *
 * Pause and resume are merged from every source a target has (page visibility, page
 * hide, Capacitor app state, the Electron window closing) and only fire on a change, so
 * a handler runs once however many of those report the same thing.
 */
import { App } from '@capacitor/app';
import { isNativeMobile, platformInfo } from './info';
import { nativeBridge } from './native';

/** May return a promise; the desktop window waits for it before closing (e.g. to flush saves). */
export type PauseHandler = () => void | Promise<void>;

const pauseHandlers = new Set<PauseHandler>();
const resumeHandlers = new Set<() => void>();
let active = true;
let wired = false;

/**
 * Runs when the app goes to the background, is minimised, or is about to close. While the
 * desktop app is closing it can run again even though the app is already paused, so
 * handlers should be safe to repeat (flushing a save is).
 */
export function onPause(handler: PauseHandler): () => void {
  wireLifecycle();
  pauseHandlers.add(handler);
  return () => pauseHandlers.delete(handler);
}

export function onResume(handler: () => void): () => void {
  wireLifecycle();
  resumeHandlers.add(handler);
  return () => resumeHandlers.delete(handler);
}

function wireLifecycle(): void {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  const visible = () => document.visibilityState !== 'hidden';
  active = visible();
  document.addEventListener('visibilitychange', () => setActive(visible()));
  window.addEventListener('pagehide', () => setActive(false));
  window.addEventListener('pageshow', () => setActive(visible()));
  if (isNativeMobile()) {
    App.addListener('appStateChange', ({ isActive }) => setActive(isActive)).catch(warn);
  }
  nativeBridge()?.app.setCloseHandler(async () => {
    active = false;
    await runPauseHandlers();
  });
}

function setActive(next: boolean): void {
  if (next === active) return;
  active = next;
  if (next) for (const handler of [...resumeHandlers]) guard(handler);
  else void runPauseHandlers();
}

async function runPauseHandlers(): Promise<void> {
  const results = await Promise.allSettled([...pauseHandlers].map(async (handler) => handler()));
  for (const result of results) if (result.status === 'rejected') warn(result.reason);
}

function guard(handler: () => void): void {
  try {
    handler();
  } catch (err) {
    warn(err);
  }
}

// --- Android back button ---------------------------------------------------------------

const backHandlers: (() => void)[] = [];
let backWired = false;

/**
 * Android's back button. Handlers stack: only the most recently registered one runs, so a
 * dialog can take over from the screen beneath it and hand back control when it closes.
 * With no handler registered, back behaves as Android normally does (history, then exit).
 * Does nothing on other platforms.
 */
export function onBackButton(handler: () => void): () => void {
  if (platformInfo().kind !== 'android') return () => {};
  if (!backWired) {
    backWired = true;
    // Registering any listener turns off Capacitor's default back behaviour, hence the fallback.
    App.addListener('backButton', ({ canGoBack }) => {
      const top = backHandlers.at(-1);
      if (top) guard(top);
      else if (canGoBack) history.back();
      else App.exitApp().catch(warn);
    }).catch(warn);
  }
  backHandlers.push(handler);
  return () => {
    const index = backHandlers.lastIndexOf(handler);
    if (index >= 0) backHandlers.splice(index, 1);
  };
}

// --- Window ----------------------------------------------------------------------------

/** Whether toggleFullscreen() can do anything here (mobile apps are always fullscreen). */
export function canFullscreen(): boolean {
  if (nativeBridge()) return true;
  // iPhone Safari has no Fullscreen API at all, so fullscreenEnabled is undefined there.
  return platformInfo().kind === 'web' && typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

/** Desktop window or browser fullscreen. On the web it must be called from a user gesture. */
export function toggleFullscreen(): void {
  const bridge = nativeBridge();
  if (bridge) {
    bridge.app.toggleFullscreen();
    return;
  }
  if (!canFullscreen()) return;
  const request = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  request.catch(warn);
}

/**
 * Quits the desktop app or closes the Android app. iOS apps must not quit themselves and
 * browsers can't, so it does nothing there; check platformInfo().kind before offering it.
 */
export function exitApp(): void {
  const bridge = nativeBridge();
  if (bridge) bridge.app.quit();
  else if (platformInfo().kind === 'android') App.exitApp().catch(warn);
}

function warn(err: unknown): void {
  console.warn('[platform]', err);
}
