/**
 * Windows glue: the per-user registry entries for "Start with Windows" and the keyboard's
 * Calculator key. Everything lives under HKEY_CURRENT_USER, so no admin rights are needed.
 * Uses the stock reg.exe; nothing here needs Electron.
 */

import { execFileSync } from 'node:child_process';

export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const RUN_VALUE = 'QuickCalc';
/** Explorer's per-user override for the keyboard's dedicated Calculator key (app key 18). */
export const APPKEY_CALC = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\AppKey\\18';

export interface LaunchInfo {
  /** The running executable (QuickCalc.exe when packaged, electron.exe from source). */
  execPath: string;
  /** The app folder passed to electron.exe when running from source. */
  appPath: string;
  packaged: boolean;
}

/** The command line that starts this copy of QuickCalc. */
export function launchCommand(info: LaunchInfo, ...args: string[]): string {
  const parts = info.packaged ? [info.execPath] : [info.execPath, info.appPath];
  return [...parts.map((p) => `"${p}"`), ...args].join(' ');
}

function reg(args: string[]): string | null {
  if (process.platform !== 'win32') return null;
  try {
    return execFileSync('reg.exe', args, { encoding: 'utf-8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** A REG_SZ value, or null if the key or value doesn't exist. */
export function readValue(key: string, value: string): string | null {
  const out = reg(['query', key, '/v', value]);
  if (out === null) return null;
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*(.+?)\s{4}REG_(?:EXPAND_)?SZ\s{4}(.*)$/.exec(line);
    if (m && m[1].toLowerCase() === value.toLowerCase()) return m[2];
  }
  return null;
}

export function writeValue(key: string, value: string, data: string): boolean {
  return reg(['add', key, '/v', value, '/t', 'REG_SZ', '/d', data, '/f']) !== null;
}

export function deleteValue(key: string, value: string): boolean {
  if (readValue(key, value) === null) return true;
  return reg(['delete', key, '/v', value, '/f']) !== null;
}

export function deleteKey(key: string): boolean {
  if (reg(['query', key]) === null) return true;
  return reg(['delete', key, '/f']) !== null;
}

// ---------------------------------------------------------------- start with Windows

export function autostartEnabled(): boolean {
  return readValue(RUN_KEY, RUN_VALUE) !== null;
}

/** Add or remove the HKCU Run entry. Returns true on success. */
export function setAutostart(enabled: boolean, info: LaunchInfo): boolean {
  return enabled ? writeValue(RUN_KEY, RUN_VALUE, launchCommand(info, '--tray')) : deleteValue(RUN_KEY, RUN_VALUE);
}

// ------------------------------------------------------------------- calculator key

/** The override stores a single program path, so it only works for the built exe. */
export function calculatorKeySupported(info: LaunchInfo): boolean {
  return info.packaged;
}

export function calculatorKeyEnabled(info: LaunchInfo): boolean {
  const target = readValue(APPKEY_CALC, 'ShellExecute');
  return target !== null && info.packaged && target.toLowerCase() === info.execPath.toLowerCase();
}

/** Point the keyboard's Calculator key at QuickCalc, or restore the Windows default by
 * deleting the override key again. */
export function setCalculatorKey(enabled: boolean, info: LaunchInfo): boolean {
  if (enabled) return calculatorKeySupported(info) && writeValue(APPKEY_CALC, 'ShellExecute', info.execPath);
  return deleteKey(APPKEY_CALC);
}
