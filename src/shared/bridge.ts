/** The API the preload script exposes to the windows as `window.quickcalc`. Types only. */

import type { CustomUnitsSource } from '../engine/units';
import type { HistoryEntry, Settings } from './settings';

export interface InitData {
  settings: Settings;
  history: HistoryEntry[];
  customUnits: CustomUnitsSource | null;
}

export interface SystemOptions {
  autostart: boolean;
  calculatorKey: boolean;
  calculatorKeySupported: boolean;
}

export interface SettingsState extends SystemOptions {
  settings: Settings;
}

export interface QuickCalcBridge {
  // ---- calculator window
  init(): Promise<InitData>;
  /** A setting changed from inside the calculator window (keypad / history toggles). */
  updateSettings(patch: Partial<Settings>): void;
  saveHistory(entries: HistoryEntry[]): void;
  copy(text: string): void;
  hide(): void;
  /** Size the frameless window to its content. */
  resize(width: number, height: number): void;
  openSettings(): void;
  notify(title: string, text: string, warning: boolean): void;
  onSettingsChanged(callback: (settings: Settings) => void): () => void;
  onHistoryCleared(callback: () => void): () => void;
  /** The window was summoned: focus the input and select its text. */
  onShown(callback: () => void): () => void;

  // ---- settings window
  getSettingsState(): Promise<SettingsState>;
  submitSettings(settings: Settings, system: Omit<SystemOptions, 'calculatorKeySupported'>): Promise<void>;
  closeSettings(): void;
  clearHistory(): void;
  openUnitsFile(): void;
  /** Pause the global hotkey while a new one is being recorded. */
  suspendHotkey(suspended: boolean): void;
}

declare global {
  interface Window {
    quickcalc?: QuickCalcBridge;
  }
}
