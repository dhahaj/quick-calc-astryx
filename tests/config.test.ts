/** Settings/history persistence, hotkey parsing and the launch command. None of this needs Electron. */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import * as config from '../electron/config';
import { launchCommand } from '../electron/winplatform';
import { Engine } from '../src/engine';
import { MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, hotkeyFromEvent, parseHotkey } from '../src/shared/hotkey';
import {
  DEFAULT_HOTKEY,
  HISTORY_LIMIT,
  type HistoryEntry,
  addHistoryEntry,
  defaultSettings,
  formatSettingsOf,
} from '../src/shared/settings';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quickcalc-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('settings roundtrip', () => {
  const file = path.join(tmp, 'QuickCalc', 'settings.json');
  const settings = { ...defaultSettings(), hotkey: 'Ctrl+Shift+Space', show_keypad: true, sig_figs: 6, last_offset: [10, 20] as [number, number], theme: 'dark' as const };
  expect(config.saveSettings(settings, file)).toBe(true);
  expect(config.loadSettings(file)).toEqual(settings);
});

test('missing or corrupt settings fall back to defaults', () => {
  expect(config.loadSettings(path.join(tmp, 'nope.json'))).toEqual(defaultSettings());
  const bad = path.join(tmp, 'settings.json');
  fs.writeFileSync(bad, '{ not json', 'utf-8');
  expect(config.loadSettings(bad)).toEqual(defaultSettings());
  fs.writeFileSync(bad, '[1, 2, 3]', 'utf-8');
  expect(config.loadSettings(bad)).toEqual(defaultSettings());
});

test('bad values are ignored or clamped', () => {
  const file = path.join(tmp, 'settings.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      sig_figs: 99,
      fixed_decimals: -3,
      theme: 'neon',
      format_mode: 'roman',
      show_keypad: 'yes', // wrong type: ignored
      hotkey: '  ',
      last_offset: [1, 'two'],
      unknown_key: 1,
      angle_mode: 'deg',
    }),
    'utf-8',
  );
  const settings = config.loadSettings(file);
  expect(settings.sig_figs).toBe(15);
  expect(settings.fixed_decimals).toBe(0);
  expect(settings.theme).toBe('system');
  expect(settings.format_mode).toBe('auto');
  expect(settings.show_keypad).toBe(false);
  expect(settings.hotkey).toBe(DEFAULT_HOTKEY);
  expect(settings.last_offset).toBeNull();
  expect(settings.angle_mode).toBe('deg');
});

test('defaults match the spec', () => {
  const s = defaultSettings();
  expect(s.hotkey).toBe('Ctrl+Alt+C');
  expect(s.format_mode).toBe('auto');
  expect(s.sig_figs).toBe(10);
  expect(s.persist_history).toBe(true);
  expect(s.copy_on_enter).toBe(true);
  expect(s.theme).toBe('system');
});

test('format settings bridge', () => {
  const fmt = formatSettingsOf({ ...defaultSettings(), format_mode: 'eng', sig_figs: 4, thousands_sep: true, show_int_bases: true });
  expect([fmt.mode, fmt.sigFigs, fmt.thousandsSep, fmt.showIntBases]).toEqual(['eng', 4, true, true]);
});

test('history roundtrip and cap', () => {
  const file = path.join(tmp, 'history.json');
  let entries: HistoryEntry[] = [];
  for (let i = 0; i < HISTORY_LIMIT + 50; i += 1) entries = addHistoryEntry(entries, { expr: `${i}+1`, result: String(i + 1), alt: null });
  expect(entries).toHaveLength(HISTORY_LIMIT);
  expect(entries[0].expr).toBe('50+1');
  expect(config.saveHistory(entries, file)).toBe(true);
  expect(config.loadHistory(file)).toEqual(entries);
});

test('history tolerates junk', () => {
  const file = path.join(tmp, 'history.json');
  fs.writeFileSync(file, JSON.stringify([{ expr: '1+1', result: '2' }, { expr: 5 }, 'x', null]), 'utf-8');
  expect(config.loadHistory(file)).toEqual([{ expr: '1+1', result: '2', alt: null }]);
  fs.writeFileSync(file, 'garbage', 'utf-8');
  expect(config.loadHistory(file)).toEqual([]);
  config.deleteHistoryFile(file);
  expect(fs.existsSync(file)).toBe(false);
  config.deleteHistoryFile(file); // deleting twice is fine
});

test('the original app’s history file still loads', () => {
  const file = path.join(tmp, 'history.json');
  fs.writeFileSync(file, JSON.stringify([{ expr: '0xFF', result: '255', alt: '0xFF  0b11111111' }]), 'utf-8');
  expect(config.loadHistory(file)).toEqual([{ expr: '0xFF', result: '255', alt: '0xFF  0b11111111' }]);
});

test('custom units file is created once', () => {
  const file = path.join(tmp, 'QuickCalc', 'units.txt');
  expect(config.ensureCustomUnitsFile(file)).toBe(file);
  expect(fs.readFileSync(file, 'utf-8')).toContain('oz_cu');
  fs.writeFileSync(file, 'smoot = 1.7018 * meter\n', 'utf-8');
  config.ensureCustomUnitsFile(file);
  expect(fs.readFileSync(file, 'utf-8')).toBe('smoot = 1.7018 * meter\n'); // never overwritten
  const engine = new Engine({ customUnits: config.readCustomUnits(file) });
  expect(engine.evaluate('1 smoot to m').text).toBe('1.7018 m');
});

test('a missing custom units file is reported', () => {
  const source = config.readCustomUnits(path.join(tmp, 'nope.txt'));
  expect(source.text).toBeNull();
  expect(new Engine({ customUnits: source }).warnings[0]).toBe("Couldn't read nope.txt: No such file or directory");
});

describe('app dir follows APPDATA', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.APPDATA;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = saved;
  });
  test('paths', () => {
    process.env.APPDATA = tmp;
    expect(config.settingsPath()).toBe(path.join(tmp, 'QuickCalc', 'settings.json'));
    expect(path.dirname(config.historyPath())).toBe(path.join(tmp, 'QuickCalc'));
    expect(path.dirname(config.customUnitsPath())).toBe(path.join(tmp, 'QuickCalc'));
  });
});

describe('parse hotkey', () => {
  test.each<[string, number, number, string]>([
    ['Ctrl+Alt+C', MOD_CONTROL | MOD_ALT, 'C'.charCodeAt(0), 'Ctrl+Alt+C'],
    ['ctrl+alt+c', MOD_CONTROL | MOD_ALT, 'C'.charCodeAt(0), 'Ctrl+Alt+C'],
    ['Ctrl + Shift + Space', MOD_CONTROL | MOD_SHIFT, 0x20, 'Ctrl+Shift+Space'],
    ['Win+Shift+F1', MOD_WIN | MOD_SHIFT, 0x70, 'Super+Shift+F1'],
    ['Meta+Alt+9', MOD_WIN | MOD_ALT, '9'.charCodeAt(0), 'Super+Alt+9'],
    ['F12', 0, 0x7b, 'F12'],
    ['Ctrl+Alt+PgUp', MOD_CONTROL | MOD_ALT, 0x21, 'Ctrl+Alt+PageUp'],
    ['Ctrl+Alt+Return', MOD_CONTROL | MOD_ALT, 0x0d, 'Ctrl+Alt+Return'],
    ['Ctrl+Alt+=', MOD_CONTROL | MOD_ALT, 0xbb, 'Ctrl+Alt+='],
    ['Ctrl++', MOD_CONTROL, 0xbb, 'Ctrl+='],
    ['Alt+`', MOD_ALT, 0xc0, 'Alt+`'],
  ])('%s', (text, modifiers, vk, accelerator) => {
    expect(parseHotkey(text)).toEqual({ modifiers, vk, accelerator });
  });

  test.each(['', 'C', '5', 'Space', 'Ctrl+', 'Ctrl+Alt', 'Hyper+C', 'Ctrl+Nope', 'Ctrl+F25', 'Ctrl++C'])('rejects %j', (text) => {
    expect(parseHotkey(text)).toBeNull();
  });

  test('records key presses the way the parser reads them', () => {
    const press = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>>) =>
      hotkeyFromEvent({ key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
    expect(press('c', 'KeyC', { ctrlKey: true, altKey: true })).toBe('Ctrl+Alt+C');
    expect(press(' ', 'Space', { ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+Space');
    expect(press('F1', 'F1', { metaKey: true })).toBe('Win+F1');
    expect(press('Control', 'ControlLeft', { ctrlKey: true })).toBeNull();
    expect(parseHotkey(press('=', 'Equal', { ctrlKey: true, altKey: true }) as string)?.vk).toBe(0xbb);
  });
});

test('launch command', () => {
  const fromSource = launchCommand({ execPath: 'C:\\x\\electron.exe', appPath: 'C:\\app', packaged: false }, '--tray');
  expect(fromSource).toBe('"C:\\x\\electron.exe" "C:\\app" --tray');
  const built = launchCommand({ execPath: 'C:\\QuickCalc\\QuickCalc.exe', appPath: '', packaged: true }, '--tray');
  expect(built).toBe('"C:\\QuickCalc\\QuickCalc.exe" --tray');
});
