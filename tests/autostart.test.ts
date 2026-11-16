/** "Start with Windows": which HKCU Run entries start this copy, and which are left over. */

import { describe, expect, test } from 'vitest';

import { type LaunchInfo, autostartProgram, isOwnAutostart, isStaleAutostart } from '../electron/winplatform';

const built: LaunchInfo = { execPath: 'D:\\Apps\\QuickCalc\\QuickCalc.exe', appPath: '', packaged: true };
const fromSource: LaunchInfo = { execPath: 'D:\\src\\node_modules\\electron\\dist\\electron.exe', appPath: 'D:\\src', packaged: false };
/** The entry the original QuickCalc leaves behind once its install folder is gone. */
const original = '"C:\\Program Files (x86)\\QuickCalc\\QuickCalc.exe" --tray';

const existing = (...paths: string[]) => (p: string) => paths.some((x) => x.toLowerCase() === p.toLowerCase());

describe('isOwnAutostart', () => {
  test('an entry that starts this copy in the tray', () => {
    expect(isOwnAutostart('"D:\\Apps\\QuickCalc\\QuickCalc.exe" --tray', built)).toBe(true);
    expect(isOwnAutostart('"d:\\apps\\quickcalc\\QUICKCALC.EXE" --tray ', built)).toBe(true);
    expect(isOwnAutostart('"D:\\src\\node_modules\\electron\\dist\\electron.exe" "D:\\src" --tray', fromSource)).toBe(true);
  });

  test('no entry, or an entry for another copy, does not count', () => {
    expect(isOwnAutostart(null, built)).toBe(false);
    expect(isOwnAutostart(original, built)).toBe(false);
    expect(isOwnAutostart('"D:\\Apps\\QuickCalc\\QuickCalc.exe" --tray', fromSource)).toBe(false);
  });
});

test('autostartProgram finds the program a Run entry starts', () => {
  expect(autostartProgram(original)).toBe('C:\\Program Files (x86)\\QuickCalc\\QuickCalc.exe');
  expect(autostartProgram('C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe')).toBe('C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe');
  expect(autostartProgram('  C:\\Tools\\qc.EXE --tray')).toBe('C:\\Tools\\qc.EXE');
  expect(autostartProgram('')).toBeNull();
  expect(autostartProgram('"unterminated --tray')).toBeNull();
});

describe('isStaleAutostart', () => {
  test('an entry whose program is gone is stale', () => {
    expect(isStaleAutostart(original, built, existing(built.execPath))).toBe(true);
    // The portable folder was moved after "Start with Windows" was ticked.
    expect(isStaleAutostart('"D:\\Old\\QuickCalc\\QuickCalc.exe" --tray', built, existing(built.execPath))).toBe(true);
  });

  test('an entry for a copy that still exists is left alone', () => {
    expect(isStaleAutostart(original, built, existing('C:\\Program Files (x86)\\QuickCalc\\QuickCalc.exe'))).toBe(false);
  });

  test('no entry, or this copy\u2019s own, is not stale', () => {
    expect(isStaleAutostart(null, built, existing())).toBe(false);
    expect(isStaleAutostart('"D:\\Apps\\QuickCalc\\QuickCalc.exe" --tray', built, existing())).toBe(false);
  });

  test('a program that cannot be checked is left alone', () => {
    expect(isStaleAutostart('%LOCALAPPDATA%\\QuickCalc\\QuickCalc.exe --tray', built, existing())).toBe(false);
    expect(isStaleAutostart('QuickCalc.exe --tray', built, existing())).toBe(false);
    expect(isStaleAutostart('rundll32 something', built, existing())).toBe(false);
  });
});
