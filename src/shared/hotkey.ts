/**
 * Global hotkey text such as "Ctrl+Alt+C": validation (same rules as the original's
 * Win32 RegisterHotKey parser) and conversion to an Electron accelerator.
 */

export const MOD_ALT = 0x1;
export const MOD_CONTROL = 0x2;
export const MOD_SHIFT = 0x4;
export const MOD_WIN = 0x8;

const MODIFIERS: Readonly<Record<string, number>> = {
  ctrl: MOD_CONTROL, control: MOD_CONTROL, alt: MOD_ALT, shift: MOD_SHIFT,
  win: MOD_WIN, meta: MOD_WIN, super: MOD_WIN,
};

// name -> [Windows virtual-key code, Electron accelerator key]
const NAMED_KEYS: Readonly<Record<string, readonly [number, string]>> = {
  space: [0x20, 'Space'], tab: [0x09, 'Tab'], enter: [0x0d, 'Return'], return: [0x0d, 'Return'],
  esc: [0x1b, 'Escape'], escape: [0x1b, 'Escape'], backspace: [0x08, 'Backspace'],
  ins: [0x2d, 'Insert'], insert: [0x2d, 'Insert'], del: [0x2e, 'Delete'], delete: [0x2e, 'Delete'],
  home: [0x24, 'Home'], end: [0x23, 'End'], pgup: [0x21, 'PageUp'], pageup: [0x21, 'PageUp'],
  pgdown: [0x22, 'PageDown'], pagedown: [0x22, 'PageDown'],
  up: [0x26, 'Up'], down: [0x28, 'Down'], left: [0x25, 'Left'], right: [0x27, 'Right'],
  pause: [0x13, 'Pause'], print: [0x2c, 'PrintScreen'],
  '`': [0xc0, '`'], '-': [0xbd, '-'], '=': [0xbb, '='], '[': [0xdb, '['], ']': [0xdd, ']'],
  '\\': [0xdc, '\\'], ';': [0xba, ';'], "'": [0xde, "'"], ',': [0xbc, ','], '.': [0xbe, '.'],
  '/': [0xbf, '/'], '+': [0xbb, '='],
};

export interface ParsedHotkey {
  modifiers: number;
  vk: number;
  accelerator: string;
}

/**
 * "Ctrl+Alt+C" -> modifier flags, virtual-key code and Electron accelerator, or null if it
 * isn't usable. A plain key with no modifier is refused (it would swallow normal typing)
 * unless it is a function key.
 */
export function parseHotkey(input: string): ParsedHotkey | null {
  const text = input.trim();
  if (!text) return null;
  let parts: string[];
  if (text.endsWith('++') || text === '+') {
    parts = [...text.slice(0, -1).split('+').filter(Boolean), '+'];
  } else {
    parts = text.split('+').map((p) => p.trim());
  }
  if (!parts.every(Boolean)) return null;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  let flags = 0;
  const accel: string[] = [];
  for (const mod of mods) {
    const flag = MODIFIERS[mod.toLowerCase()];
    if (flag === undefined) return null;
    if (!(flags & flag)) accel.push(flag === MOD_CONTROL ? 'Ctrl' : flag === MOD_ALT ? 'Alt' : flag === MOD_SHIFT ? 'Shift' : 'Super');
    flags |= flag;
  }
  const name = key.toLowerCase();
  let vk: number;
  let accelKey: string;
  let functionKey = false;
  const fn = /^f(\d+)$/.exec(name);
  if (key.length === 1 && /^[A-Za-z0-9]$/.test(key)) {
    vk = key.toUpperCase().charCodeAt(0);
    accelKey = key.toUpperCase();
  } else if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= 24) {
    vk = 0x70 + Number(fn[1]) - 1;
    accelKey = `F${Number(fn[1])}`;
    functionKey = true;
  } else if (Object.hasOwn(NAMED_KEYS, name)) {
    [vk, accelKey] = NAMED_KEYS[name];
  } else {
    return null;
  }
  if (!flags && !functionKey) return null;
  return { modifiers: flags, vk, accelerator: [...accel, accelKey].join('+') };
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space', Enter: 'Return', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down',
  ArrowLeft: 'Left', ArrowRight: 'Right', PageUp: 'PgUp', PageDown: 'PgDown',
  Delete: 'Del', Insert: 'Ins', PrintScreen: 'Print',
};

/**
 * Hotkey text for a browser keydown, as the settings field records it ("Ctrl+Alt+C"), or
 * null while only modifiers are held.
 */
export function hotkeyFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph'].includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key;
  else if (Object.hasOwn(KEY_NAMES, e.key)) key = KEY_NAMES[e.key];
  else if (e.code === 'Equal') key = '=';
  else if (e.code === 'Minus') key = '-';
  else if (e.code === 'Backquote') key = '`';
  else if (e.code === 'BracketLeft') key = '[';
  else if (e.code === 'BracketRight') key = ']';
  else if (e.code === 'Backslash') key = '\\';
  else if (e.code === 'Semicolon') key = ';';
  else if (e.code === 'Quote') key = "'";
  else if (e.code === 'Comma') key = ',';
  else if (e.code === 'Period') key = '.';
  else if (e.code === 'Slash') key = '/';
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Win');
  parts.push(key);
  return parts.join('+');
}
