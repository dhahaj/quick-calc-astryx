/**
 * The bridge to the Electron main process. When the page runs in a plain browser
 * (`npm run dev:web`), a stand-in backed by localStorage takes its place so the UI can be
 * developed and checked without Electron; the tray, global hotkey and registry options are
 * then simply absent.
 */

import type { InitData, QuickCalcBridge, SettingsState } from '../shared/bridge';
import { CUSTOM_UNITS_TEMPLATE } from '../engine/units';
import { type HistoryEntry, type Settings, historyFromData, settingsFromData } from '../shared/settings';

type Listener<T> = (value: T) => void;

class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}

const SETTINGS_KEY = 'quickcalc.settings';
const HISTORY_KEY = 'quickcalc.history';

function readStorage(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the session still works, it just isn't remembered
  }
}

/** Emitted when the browser stand-in is asked to show the settings. */
export const webSettingsRequested = new Emitter<void>();

function createWebBridge(): QuickCalcBridge {
  let settings: Settings = settingsFromData(readStorage(SETTINGS_KEY));
  let history: HistoryEntry[] = settings.persist_history ? historyFromData(readStorage(HISTORY_KEY)) : [];
  const settingsChanged = new Emitter<Settings>();
  const historyCleared = new Emitter<void>();
  const shown = new Emitter<void>();

  const save = () => writeStorage(SETTINGS_KEY, settings);

  return {
    async init(): Promise<InitData> {
      return { settings, history, customUnits: { name: 'units.txt', text: CUSTOM_UNITS_TEMPLATE } };
    },
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      save();
    },
    saveHistory(entries) {
      history = entries;
      if (settings.persist_history) writeStorage(HISTORY_KEY, entries);
    },
    copy(text) {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    },
    hide() {},
    resize() {},
    openSettings() {
      webSettingsRequested.emit();
    },
    notify(title, text) {
      console.warn(`QuickCalc: ${title}\n${text}`);
    },
    onSettingsChanged: (callback) => settingsChanged.on(callback),
    onHistoryCleared: (callback) => historyCleared.on(callback),
    onShown: (callback) => shown.on(callback),

    async getSettingsState(): Promise<SettingsState> {
      return { settings, autostart: false, calculatorKey: false, calculatorKeySupported: false };
    },
    async submitSettings(next) {
      const persistChanged = next.persist_history !== settings.persist_history;
      settings = { ...next, last_offset: settings.last_offset };
      save();
      if (persistChanged) {
        if (settings.persist_history) writeStorage(HISTORY_KEY, history);
        else window.localStorage.removeItem(HISTORY_KEY);
      }
      settingsChanged.emit(settings);
    },
    closeSettings() {},
    clearHistory() {
      historyCleared.emit();
    },
    openUnitsFile() {},
    suspendHotkey() {},
  };
}

export const isElectron = window.quickcalc !== undefined;
export const bridge: QuickCalcBridge = window.quickcalc ?? createWebBridge();
