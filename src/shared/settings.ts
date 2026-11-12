/**
 * Settings and history data, shared by the Electron main process and the windows.
 *
 * The JSON shapes match the original QuickCalc's settings.json and history.json, so an
 * existing %APPDATA%\QuickCalc folder keeps working.
 */

import { type FormatMode, type FormatSettings, MODES } from '../engine/formatter';

export const HISTORY_LIMIT = 500;
export const DEFAULT_HOTKEY = 'Ctrl+Alt+C';

export type Position = 'center' | 'last';
export type ThemeChoice = 'system' | 'dark' | 'light';
export type AngleMode = 'rad' | 'deg';

export interface Settings {
  hotkey: string;
  position: Position;
  /** Window offset from its screen's top-left corner. */
  last_offset: [number, number] | null;
  hide_on_focus_loss: boolean;
  theme: ThemeChoice;
  copy_on_enter: boolean;
  show_keypad: boolean;
  show_history: boolean;
  persist_history: boolean;
  angle_mode: AngleMode;
  format_mode: FormatMode;
  sig_figs: number;
  fixed_decimals: number;
  thousands_sep: boolean;
  show_int_bases: boolean;
}

export function defaultSettings(): Settings {
  return {
    hotkey: DEFAULT_HOTKEY,
    position: 'center',
    last_offset: null,
    hide_on_focus_loss: false,
    theme: 'system',
    copy_on_enter: true,
    show_keypad: false,
    show_history: true,
    persist_history: true,
    angle_mode: 'rad',
    format_mode: 'auto',
    sig_figs: 10,
    fixed_decimals: 4,
    thousands_sep: false,
    show_int_bases: false,
  };
}

const INT_FIELDS = new Set<keyof Settings>(['sig_figs', 'fixed_decimals']);

export function formatSettingsOf(s: Settings): FormatSettings {
  return {
    mode: s.format_mode,
    sigFigs: s.sig_figs,
    fixedDecimals: s.fixed_decimals,
    thousandsSep: s.thousands_sep,
    showIntBases: s.show_int_bases,
  };
}

/** Clamp anything out of range back to a sane value (hand-edited files happen). */
export function validateSettings(s: Settings): Settings {
  const d = defaultSettings();
  const out = { ...s };
  if (out.position !== 'center' && out.position !== 'last') out.position = d.position;
  if (out.theme !== 'system' && out.theme !== 'dark' && out.theme !== 'light') out.theme = d.theme;
  if (out.angle_mode !== 'rad' && out.angle_mode !== 'deg') out.angle_mode = d.angle_mode;
  if (!(MODES as readonly string[]).includes(out.format_mode)) out.format_mode = d.format_mode;
  out.sig_figs = Math.max(1, Math.min(15, out.sig_figs));
  out.fixed_decimals = Math.max(0, Math.min(12, out.fixed_decimals));
  if (!out.hotkey.trim()) out.hotkey = d.hotkey;
  const offset = out.last_offset as unknown;
  if (!(Array.isArray(offset) && offset.length === 2 && offset.every((v) => Number.isInteger(v)))) {
    out.last_offset = null;
  }
  return out;
}

/** Settings from parsed JSON: only values of the same type as the default are accepted. */
export function settingsFromData(data: unknown): Settings {
  const settings = defaultSettings();
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const target = settings as unknown as Record<string, unknown>;
    for (const key of Object.keys(settings) as (keyof Settings)[]) {
      if (!Object.hasOwn(record, key)) continue;
      const value = record[key];
      const fallback = target[key];
      if (fallback === null || value === null) {
        target[key] = value;
      } else if (INT_FIELDS.has(key)) {
        if (typeof value === 'number' && Number.isInteger(value)) target[key] = value;
      } else if (typeof value === typeof fallback) {
        target[key] = value;
      }
    }
  }
  return validateSettings(settings);
}

// -------------------------------------------------------------------------- history

export interface HistoryEntry {
  expr: string;
  result: string;
  alt: string | null;
}

/** Append an entry, keeping at most HISTORY_LIMIT. */
export function addHistoryEntry(entries: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...entries, entry].slice(-HISTORY_LIMIT);
}

/** History from parsed JSON, skipping anything malformed. */
export function historyFromData(data: unknown): HistoryEntry[] {
  if (!Array.isArray(data)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of data.slice(-HISTORY_LIMIT)) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const { expr, result, alt } = item as Record<string, unknown>;
      if (typeof expr === 'string' && typeof result === 'string') {
        entries.push({ expr, result, alt: typeof alt === 'string' ? alt : null });
      }
    }
  }
  return entries;
}
