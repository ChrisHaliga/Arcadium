/**
 * Save-file backends. Each target stores where its platform's cloud backup looks:
 * Electron writes files that Steam Auto-Cloud syncs, Capacitor uses Preferences
 * (covered by iOS backups and Android Auto Backup), and the web uses localStorage.
 *
 * Read errors are passed on rather than turned into "no save": the meta layer treats a
 * failed read as "don't write this session", which is what keeps a transient error from
 * replacing real progress with a fresh save.
 */
import { Preferences } from '@capacitor/preferences';
import type { StorageAdapter } from '../shared/services';
import { isNativeMobile } from './info';
import { nativeBridge } from './native';

export function createStorage(): StorageAdapter {
  const bridge = nativeBridge();
  if (bridge) {
    return {
      load: (key) => bridge.storage.load(key),
      save: (key, value) => bridge.storage.save(key, value),
    };
  }
  if (isNativeMobile()) {
    return {
      load: async (key) => (await Preferences.get({ key })).value,
      save: (key, value) => Preferences.set({ key, value }),
    };
  }
  return webStorage();
}

const PROBE_KEY = 'arcadium.storage-probe';

/**
 * localStorage when it works, otherwise memory for this session. "Works" is decided once
 * up front: private modes and blocked site data either throw on access or refuse every
 * write, and in that case there is no stored progress to protect, so playing on from
 * memory is better than failing.
 */
function webStorage(): StorageAdapter {
  const local = usableLocalStorage();
  if (local) {
    // async turns any throw (quota, storage cleared mid-session) into a rejection the caller handles.
    return {
      load: async (key) => local.getItem(key),
      save: async (key, value) => local.setItem(key, value),
    };
  }
  console.warn('[platform] localStorage is unavailable; progress will not be kept after this session');
  const memory = new Map<string, string>();
  return {
    load: async (key) => memory.get(key) ?? null,
    save: async (key, value) => {
      memory.set(key, value);
    },
  };
}

function usableLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
    return localStorage;
  } catch {
    return null;
  }
}
