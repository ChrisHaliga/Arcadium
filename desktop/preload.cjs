'use strict';
/**
 * Runs in the sandboxed renderer before the game loads and exposes the small native API
 * the game uses as `window.arcadiumNative`. Its shape is typed in src/platform/native.ts;
 * keep the two in sync.
 */
const { contextBridge, ipcRenderer } = require('electron');

let closeHandler = null;

// The main process asks before closing; answer once the game has flushed, even if that failed.
ipcRenderer.on('app:close-request', async () => {
  try {
    if (closeHandler) await closeHandler();
  } catch (err) {
    console.error('[arcadium] close handler failed', err);
  } finally {
    ipcRenderer.send('app:close-ready');
  }
});

contextBridge.exposeInMainWorld('arcadiumNative', {
  platform: {
    os: process.platform,
    steamDeck: process.argv.includes('--arcadium-steam-deck'),
  },
  storage: {
    load: (key) => ipcRenderer.invoke('storage:load', key),
    save: (key, value) => ipcRenderer.invoke('storage:save', key, value),
  },
  app: {
    toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
    quit: () => ipcRenderer.send('app:quit'),
    setCloseHandler: (handler) => {
      closeHandler = handler;
    },
  },
});
