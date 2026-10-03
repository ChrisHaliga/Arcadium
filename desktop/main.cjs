'use strict';
/**
 * Electron main process for the Steam build. Loads the web build copied into ./app
 * (or the Vite dev server with --dev), stores saves as plain files that Steam Auto-Cloud
 * can sync, and lets the game flush its save before the window closes.
 */
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5173/';
const APP_DIR = path.join(__dirname, 'app');
const APP_URL = pathToFileURL(APP_DIR).href;
const BACKGROUND = '#1b1440';
/** How long a closing window waits for the game to flush its save before closing anyway. */
const CLOSE_TIMEOUT_MS = 3000;
/** Save keys become file names, so only allow plain names (no paths, no dot-files). */
const KEY_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;

// A fixed folder name, so the saves path matches what Steam Auto-Cloud is configured with
// no matter how the executable is named: <appData>/Arcadium/saves.
app.setName('Arcadium');
app.setPath('userData', path.join(app.getPath('appData'), 'Arcadium'));
const SAVES_DIR = path.join(app.getPath('userData'), 'saves');

/** Steam sets these on the Deck and in SteamOS; /etc/os-release covers launches outside Steam. */
function isSteamDeck() {
  if (process.env.SteamDeck === '1' || process.env.SteamOS === '1') return true;
  if (process.platform !== 'linux') return false;
  try {
    return /^ID=steamos$/m.test(fs.readFileSync('/etc/os-release', 'utf8'));
  } catch {
    return false;
  }
}

function savePath(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw new Error(`Invalid save key: ${key}`);
  return path.join(SAVES_DIR, key);
}

function loadSave(key) {
  try {
    return fs.readFileSync(savePath(key), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Write to a temp file, fsync, then rename: a crash or power cut mid-write never leaves half a save. */
function writeSave(key, value) {
  if (typeof value !== 'string') throw new Error('Save data must be a string');
  const file = savePath(key);
  const temp = `${file}~`;
  fs.mkdirSync(SAVES_DIR, { recursive: true });
  const fd = fs.openSync(temp, 'w');
  try {
    fs.writeFileSync(fd, value, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}

/** Only our own page may use the bridge, never something it navigated to. */
function fromApp(event) {
  const url = event.senderFrame?.url ?? '';
  return DEV ? url.startsWith(DEV_URL) : url.startsWith(APP_URL);
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) throw new Error(`Blocked ${channel} from ${event.senderFrame?.url}`);
    return fn(...args);
  });
}

function on(channel, fn) {
  ipcMain.on(channel, (event) => {
    if (fromApp(event)) fn(BrowserWindow.fromWebContents(event.sender));
  });
}

function toggleFullscreen(win) {
  win.setFullScreen(!win.isFullScreen());
}

function createWindow() {
  const steamDeck = isSteamDeck();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Arcadium',
    backgroundColor: BACKGROUND,
    fullscreen: steamDeck,
    autoHideMenuBar: true,
    // Shown once the first frame is ready, so there is no white flash on start.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Music should play from the first screen, not wait for a click as browsers require.
      autoplayPolicy: 'no-user-gesture-required',
      // Online matches keep running when the window is behind another one.
      backgroundThrottling: false,
      additionalArguments: steamDeck ? ['--arcadium-steam-deck'] : [],
    },
  });
  win.once('ready-to-show', () => win.show());

  // No menu bar means no menu accelerators, so the game's window shortcuts live here.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      event.preventDefault();
      toggleFullscreen(win);
    } else if (DEV && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });

  // Links open in the player's browser; the game window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  // Ask the game to flush its save before closing; close anyway if it doesn't answer in time.
  let closeApproved = false;
  let closeRequested = false;
  const approveClose = () => {
    if (closeApproved || win.isDestroyed()) return;
    closeApproved = true;
    win.close();
  };
  win.on('close', (event) => {
    if (closeApproved || win.webContents.isCrashed()) return;
    event.preventDefault();
    if (closeRequested) return;
    closeRequested = true;
    ipcMain.once('app:close-ready', approveClose);
    setTimeout(approveClose, CLOSE_TIMEOUT_MS);
    win.webContents.send('app:close-request');
  });

  const loading = DEV ? win.loadURL(DEV_URL) : win.loadFile(path.join(APP_DIR, 'index.html'));
  loading.catch((err) => {
    const hint = DEV ? 'Is `npm run dev` running in the repo root?' : 'Run `npm run copy-web` to copy the web build into desktop/app.';
    console.error(`Could not load the game. ${hint}`, err);
  });
}

if (!app.requestSingleInstanceLock()) {
  // Steam (or the player) started a second copy: hand focus to the first one and leave.
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  handle('storage:load', loadSave);
  handle('storage:save', writeSave);
  on('app:toggle-fullscreen', (win) => win && toggleFullscreen(win));
  on('app:quit', (win) => win?.close());

  app.whenReady().then(() => {
    // macOS keeps a minimal app menu so Cmd+Q and copy/paste in text fields still work.
    Menu.setApplicationMenu(
      process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]) : null,
    );
    createWindow();
  });

  // A game quits with its window, on every platform.
  app.on('window-all-closed', () => app.quit());
}
