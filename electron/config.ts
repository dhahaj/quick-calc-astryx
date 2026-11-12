/** Settings, history and custom units on disk, in %APPDATA%\QuickCalc. No Electron, no network. */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CUSTOM_UNITS_TEMPLATE, type CustomUnitsSource } from '../src/engine/units';
import {
  type HistoryEntry,
  type Settings,
  historyFromData,
  settingsFromData,
} from '../src/shared/settings';

export function appDir(): string {
  const base = process.env.APPDATA;
  return path.join(base ? base : path.join(os.homedir(), 'AppData', 'Roaming'), 'QuickCalc');
}

export const settingsPath = () => path.join(appDir(), 'settings.json');
export const historyPath = () => path.join(appDir(), 'history.json');
export const customUnitsPath = () => path.join(appDir(), 'units.txt');

/** Write atomically so a crash mid-write can't leave a half-written file. */
function writeJson(file: string, data: unknown): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadSettings(file = settingsPath()): Settings {
  return settingsFromData(readJson(file));
}

export function saveSettings(settings: Settings, file = settingsPath()): boolean {
  return writeJson(file, settings);
}

export function loadHistory(file = historyPath()): HistoryEntry[] {
  return historyFromData(readJson(file));
}

export function saveHistory(entries: readonly HistoryEntry[], file = historyPath()): boolean {
  return writeJson(file, entries);
}

export function deleteHistoryFile(file = historyPath()): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // nothing to do
  }
}

/** Create the custom units file with commented examples the first time round. */
export function ensureCustomUnitsFile(file = customUnitsPath()): string {
  if (!fs.existsSync(file)) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, CUSTOM_UNITS_TEMPLATE, 'utf-8');
    } catch {
      // the engine reports an unreadable file as a warning
    }
  }
  return file;
}

/** The custom units file as the engine wants it: text, or why it couldn't be read. */
export function readCustomUnits(file = customUnitsPath()): CustomUnitsSource {
  const name = path.basename(file);
  try {
    return { name, text: fs.readFileSync(file, 'utf-8') };
  } catch (exc) {
    const code = (exc as NodeJS.ErrnoException).code;
    return { name, text: null, error: code === 'ENOENT' ? 'No such file or directory' : String((exc as Error).message) };
  }
}
