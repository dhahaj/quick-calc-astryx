/**
 * Application shell: tray icon, global hotkey, single instance, the frameless calculator
 * window, the settings window, and persistence.
 *
 *   QuickCalc.exe            start and show the calculator
 *   QuickCalc.exe --tray     start hidden in the tray (used by "Start with Windows")
 *   QuickCalc.exe --quit     ask the running copy to exit
 */

import * as path from 'node:path';

import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  shell,
} from 'electron';

import { parseHotkey } from '../src/shared/hotkey';
import type { InitData, SettingsState, SystemOptions } from '../src/shared/bridge';
import {
  type HistoryEntry,
  type Settings,
  historyFromData,
  settingsFromData,
  validateSettings,
} from '../src/shared/settings';
import * as config from './config';
import * as winplatform from './winplatform';

const APP_NAME = 'QuickCalc';
const CONTENT_WIDTH = 406;
const args = process.argv.slice(1);
const smokeDir = process.env.QUICKCALC_SMOKE_DIR;

// Chromium's own files go in a subfolder, so %APPDATA%\QuickCalc stays readable.
app.setPath('userData', path.join(config.appDir(), 'electron'));
app.setAppUserModelId(APP_NAME);

const launch = (): winplatform.LaunchInfo => ({
  execPath: process.execPath,
  appPath: app.getAppPath(),
  packaged: app.isPackaged,
});

const asset = (name: string) => path.join(__dirname, '..', 'assets', name);
const preload = path.join(__dirname, 'preload.cjs');

let settings: Settings = config.loadSettings();
let history: HistoryEntry[] = settings.persist_history ? config.loadHistory() : [];
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let hotkeyRegistered: string | null = null;
let saveTimer: NodeJS.Timeout | undefined;
let resolveMainReady: () => void = () => undefined;
const mainReady = new Promise<void>((resolve) => {
  resolveMainReady = resolve;
});

// ------------------------------------------------------------------ single instance

const gotLock = app.requestSingleInstanceLock({ command: args.includes('--quit') ? 'quit' : 'show' });
if (!gotLock || args.includes('--quit')) {
  // Either another copy now has the message, or there is nothing running to quit.
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _cwd, data) => {
    const command = (data as { command?: string } | undefined)?.command;
    if (command === 'quit' || argv.includes('--quit')) quit();
    else void mainReady.then(summon);
  });
  app.on('window-all-closed', () => {
    // A tray app keeps running with no windows open.
  });
  app.on('will-quit', shutdown);
  void app.whenReady().then(start);
}

// ----------------------------------------------------------------------- startup

function start(): void {
  Menu.setApplicationMenu(null);
  applyTheme();

  const icon = nativeImage.createFromPath(asset('qc.ico'));
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.on('click', toggleWindow);
  tray.on('right-click', () => tray?.popUpContextMenu(trayMenu()));

  config.ensureCustomUnitsFile();
  createMainWindow(icon);
  registerIpc();
  if (!smokeDir) registerHotkeyOrNotify();

  if (smokeDir) {
    void import('./smoke').then(({ runSmokeTest }) =>
      runSmokeTest(smokeDir, { mainReady, summon, openSettings, getMain: () => mainWindow, getSettings: () => settingsWindow, quit }),
    );
  } else if (!args.includes('--tray')) {
    void mainReady.then(summon);
  }
}

function webPreferences(): Electron.WebPreferences {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: false,
    backgroundThrottling: false,
  };
}

function loadPage(win: BrowserWindow, hash = ''): void {
  const devUrl = process.env.QUICKCALC_DEV_URL;
  if (devUrl) void win.loadURL(devUrl + hash);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: hash.replace(/^#/, '') });
}

/** Nothing in the windows may navigate away or open new windows. */
function lockDown(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

function background(): string {
  return nativeTheme.shouldUseDarkColors ? '#1b1b1b' : '#f1f1f1';
}

function applyTheme(): void {
  nativeTheme.themeSource = settings.theme;
  for (const win of [mainWindow, settingsWindow]) win?.setBackgroundColor(background());
}

// ------------------------------------------------------------------ calculator window

function createMainWindow(icon: Electron.NativeImage): void {
  const win = new BrowserWindow({
    width: CONTENT_WIDTH,
    height: 300,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: APP_NAME,
    icon,
    backgroundColor: background(),
    webPreferences: webPreferences(),
  });
  mainWindow = win;
  lockDown(win);
  loadPage(win);

  win.on('blur', () => {
    if (!settings.hide_on_focus_loss) return;
    // Focus moving to our own settings window doesn't count.
    setTimeout(() => {
      if (win.isVisible() && BrowserWindow.getFocusedWindow() === null) win.hide();
    }, 60);
  });
  win.on('hide', rememberOffset);
  win.on('close', (event) => {
    // Alt+F4 hides, as the window's own close button does; Quit is in the tray menu.
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

function rememberOffset(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const offset: [number, number] = [bounds.x - area.x, bounds.y - area.y];
  const last = settings.last_offset;
  if (!last || last[0] !== offset[0] || last[1] !== offset[1]) {
    settings.last_offset = offset;
    saveSettingsSoon();
  }
}

/** Show on the monitor under the mouse and take keyboard focus. */
function summon(): void {
  const win = mainWindow;
  if (!win) return;
  if (!win.isVisible()) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const [width, height] = win.getSize();
    const offset = settings.last_offset;
    let x: number;
    let y: number;
    if (settings.position === 'last' && offset) {
      x = area.x + offset[0];
      y = area.y + offset[1];
    } else {
      x = area.x + Math.floor((area.width - width) / 2);
      y = area.y + Math.floor((area.height - height) / 2);
    }
    x = Math.max(area.x, Math.min(x, area.x + area.width - width));
    y = Math.max(area.y, Math.min(y, area.y + area.height - height));
    win.setPosition(x, y);
    win.show();
  }
  win.moveTop();
  win.focus();
  win.webContents.focus();
  win.webContents.send('window:shown');
}

function toggleWindow(): void {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else void mainReady.then(summon);
}

// --------------------------------------------------------------------- settings window

function openSettings(): void {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const parent = mainWindow?.isVisible() ? mainWindow : undefined;
  const win = new BrowserWindow({
    width: 540,
    height: 640,
    useContentSize: true,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    parent,
    title: `${APP_NAME} settings`,
    icon: nativeImage.createFromPath(asset('qc.ico')),
    backgroundColor: background(),
    webPreferences: webPreferences(),
  });
  win.setMenu(null);
  settingsWindow = win;
  lockDown(win);
  loadPage(win, '#settings');
  win.on('closed', () => {
    settingsWindow = null;
    resumeHotkey();
  });
}

// ------------------------------------------------------------------------ hotkey

function registerHotkey(text: string): boolean {
  unregisterHotkey();
  const parsed = parseHotkey(text);
  if (!parsed) return false;
  let ok = false;
  try {
    ok = globalShortcut.register(parsed.accelerator, toggleWindow) && globalShortcut.isRegistered(parsed.accelerator);
  } catch {
    ok = false;
  }
  if (ok) hotkeyRegistered = parsed.accelerator;
  return ok;
}

function unregisterHotkey(): void {
  if (hotkeyRegistered) globalShortcut.unregister(hotkeyRegistered);
  hotkeyRegistered = null;
}

/** False if Windows refuses the hotkey, which nearly always means another program owns it. */
function registerHotkeyOrNotify(): boolean {
  const ok = registerHotkey(settings.hotkey);
  if (ok) {
    tray?.setToolTip(`${APP_NAME} (${settings.hotkey})`);
  } else {
    tray?.setToolTip(`${APP_NAME} (no hotkey)`);
    notify(
      'Hotkey unavailable',
      `Couldn't register ${settings.hotkey}. Another program is probably using it. ` +
        'Pick a different one in Settings; the tray icon still opens the calculator.',
      true,
    );
  }
  return ok;
}

let hotkeySuspended = false;

function resumeHotkey(): void {
  if (hotkeySuspended) {
    hotkeySuspended = false;
    if (!smokeDir) registerHotkey(settings.hotkey);
  }
}

// --------------------------------------------------------------------------- tray

function trayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show', click: () => void mainReady.then(summon) },
    { label: 'Settings…', click: openSettings },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: winplatform.autostartEnabled(),
      click: (item) => setAutostart(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: quit },
  ]);
}

function notify(title: string, text: string, warning = false): void {
  tray?.displayBalloon({ title: `${APP_NAME}: ${title}`, content: text, iconType: warning ? 'warning' : 'info' });
}

function setAutostart(enabled: boolean): void {
  if (!winplatform.setAutostart(enabled, launch())) notify('Start with Windows', "Couldn't update the startup entry.", true);
}

// ---------------------------------------------------------------------- persistence

function saveSettingsSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => config.saveSettings(settings), 400);
}

function saveHistory(): void {
  if (settings.persist_history) config.saveHistory(history);
}

function shutdown(): void {
  globalShortcut.unregisterAll();
  clearTimeout(saveTimer);
  config.saveSettings(settings);
  saveHistory();
  tray?.destroy();
  tray = null;
}

function quit(): void {
  quitting = true;
  mainWindow?.hide();
  app.quit();
}

// ---------------------------------------------------------------------------- IPC

function applySubmittedSettings(submitted: Settings, system: Omit<SystemOptions, 'calculatorKeySupported'>): void {
  const next = settingsFromData({ ...submitted, last_offset: settings.last_offset });
  const old = settings;
  settings = validateSettings({ ...next, last_offset: old.last_offset });

  if (!smokeDir && settings.hotkey !== old.hotkey && !registerHotkeyOrNotify()) {
    settings.hotkey = old.hotkey;
    registerHotkey(old.hotkey);
    tray?.setToolTip(`${APP_NAME} (${old.hotkey})`);
  }
  if (settings.theme !== old.theme) applyTheme();
  mainWindow?.webContents.send('settings:changed', settings);

  const info = launch();
  if (system.autostart !== winplatform.autostartEnabled()) setAutostart(system.autostart);
  if (winplatform.calculatorKeySupported(info) && system.calculatorKey !== winplatform.calculatorKeyEnabled(info)) {
    if (!winplatform.setCalculatorKey(system.calculatorKey, info)) {
      notify('Calculator key', "Couldn't update the Calculator key setting.", true);
    }
  }

  if (settings.persist_history !== old.persist_history) {
    if (settings.persist_history) config.saveHistory(history);
    else config.deleteHistoryFile();
  }
  config.saveSettings(settings);
}

function registerIpc(): void {
  ipcMain.handle('app:init', (): InitData => ({
    settings,
    history,
    customUnits: config.readCustomUnits(),
  }));

  ipcMain.on('settings:update', (_event, patch: Partial<Settings>) => {
    const allowed: Partial<Settings> = {};
    if (typeof patch?.show_keypad === 'boolean') allowed.show_keypad = patch.show_keypad;
    if (typeof patch?.show_history === 'boolean') allowed.show_history = patch.show_history;
    settings = { ...settings, ...allowed };
    saveSettingsSoon();
  });

  ipcMain.on('history:save', (_event, entries: unknown) => {
    history = historyFromData(entries);
    saveHistory();
  });

  ipcMain.on('clipboard:write', (_event, text: unknown) => {
    if (typeof text === 'string') void clipboard.writeText(text);
  });

  ipcMain.on('window:hide', () => mainWindow?.hide());

  ipcMain.on('window:resize', (event, width: number, height: number) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !(width > 0 && height > 0)) return;
    const [w, h] = win.getContentSize();
    if (w !== width || h !== height) win.setContentSize(Math.round(width), Math.round(height));
    if (win === mainWindow) resolveMainReady();
    if (win === settingsWindow && !win.isVisible()) {
      win.center();
      win.show();
    }
  });

  ipcMain.on('settings:open', openSettings);
  ipcMain.on('settings:close', () => settingsWindow?.close());

  ipcMain.on('app:notify', (_event, title: string, text: string, warning: boolean) => notify(String(title), String(text), Boolean(warning)));

  ipcMain.handle('settings:state', (): SettingsState => {
    const info = launch();
    return {
      settings,
      autostart: winplatform.autostartEnabled(),
      calculatorKey: winplatform.calculatorKeyEnabled(info),
      calculatorKeySupported: winplatform.calculatorKeySupported(info),
    };
  });

  ipcMain.handle('settings:submit', (_event, submitted: Settings, system: Omit<SystemOptions, 'calculatorKeySupported'>) => {
    applySubmittedSettings(submitted, system);
  });

  ipcMain.on('history:clear', () => mainWindow?.webContents.send('history:cleared'));

  ipcMain.on('units:open', () => {
    const file = config.ensureCustomUnitsFile();
    void shell.openPath(file).then((error) => {
      if (error) notify('Custom units', `Couldn't open ${file}`, true);
    });
  });

  ipcMain.on('hotkey:suspend', (_event, suspended: boolean) => {
    if (suspended && !hotkeySuspended) {
      hotkeySuspended = true;
      unregisterHotkey();
    } else if (!suspended) {
      resumeHotkey();
    }
  });
}
