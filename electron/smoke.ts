/**
 * End-to-end smoke test of the real Electron app, run by `npm run smoke`.
 *
 * Types into the calculator window, toggles the keypad, opens the settings window, saves
 * screenshots and a log of what the windows showed, then quits. The script that starts it
 * points APPDATA at a temporary folder, so a real %APPDATA%\QuickCalc is never touched, and
 * the global hotkey is not registered.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { type BrowserWindow, clipboard } from 'electron';

export interface SmokeContext {
  mainReady: Promise<void>;
  summon(): void;
  openSettings(): void;
  getMain(): BrowserWindow | null;
  getSettings(): BrowserWindow | null;
  quit(): void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, timeout = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timed out');
    await delay(50);
  }
}

function type(win: BrowserWindow, text: string): void {
  for (const ch of text) win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
}

function key(win: BrowserWindow, keyCode: string, modifiers: Electron.InputEvent['modifiers'] = []): void {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  if (keyCode === 'Return') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
}

export async function runSmokeTest(dir: string, ctx: SmokeContext): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'smoke.log');
  fs.writeFileSync(logFile, '');
  const log = (line: string) => fs.appendFileSync(logFile, `${line}\n`);
  const shot = async (win: BrowserWindow | null, name: string) => {
    if (!win) throw new Error(`no window for ${name}`);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, name), image.toPNG());
    const [w, h] = win.getContentSize();
    log(`screenshot ${name} ${w}x${h}`);
  };
  const read = (win: BrowserWindow, js: string) => win.webContents.executeJavaScript(js) as Promise<string>;
  const resultLine = (win: BrowserWindow) => read(win, `document.querySelector('.qc-result')?.textContent ?? ''`);

  const savedClipboard = await clipboard.readText();
  try {
    await ctx.mainReady;
    ctx.summon();
    await delay(800);
    const main = ctx.getMain();
    if (!main) throw new Error('no main window');
    log(`main visible=${main.isVisible()} alwaysOnTop=${main.isAlwaysOnTop()}`);
    await shot(main, '1-empty.png');

    type(main, '9 V / 4.7 kohm');
    await delay(300);
    log(`preview: ${await resultLine(main)}`);
    await shot(main, '2-preview.png');

    key(main, 'Return');
    await delay(200);
    log(`committed: ${await resultLine(main)}`);
    log(`clipboard: ${await clipboard.readText()}`);

    for (const line of ['60 mph * 2 h', '255 to hex', '72 F to C', 'r1 = 4.7k', 'r1 || 10k']) {
      type(main, line);
      key(main, 'Return');
      await delay(150);
      log(`${line} -> ${await resultLine(main)}`);
    }
    type(main, '1/0');
    key(main, 'Return');
    await delay(150);
    log(`1/0 -> ${await resultLine(main)} (state ${await read(main, `document.querySelector('.qc-result')?.dataset.state`)})`);
    key(main, 'Escape');
    key(main, 'Up');
    await delay(150);
    log(`Up recalls: ${await read(main, `document.querySelector('input')?.value`)}`);
    key(main, 'Escape');
    type(main, '1/(2 pi * 1 kohm * 100 nF)');
    await delay(300);
    await shot(main, '3-history.png');

    key(main, 'B', ['control']);
    await delay(400);
    await shot(main, '4-keypad.png');
    await main.webContents.executeJavaScript(`[...document.querySelectorAll('.qc-key')].find(b => b.textContent === '=')?.click()`);
    await delay(200);
    log(`keypad = -> ${await resultLine(main)}`);
    key(main, 'B', ['control']);
    await delay(300);

    ctx.openSettings();
    await waitFor(() => ctx.getSettings()?.isVisible() ?? false);
    await delay(800);
    const settings = ctx.getSettings();
    if (!settings) throw new Error('no settings window');
    await shot(settings, '5-settings.png');
    log(`settings title: ${settings.getTitle()}`);

    // Record a new hotkey: focus the field and press Ctrl+Shift+K.
    await settings.webContents.executeJavaScript(`document.querySelector('input[placeholder="Press a key combination"]').focus()`);
    key(settings, 'K', ['control', 'shift']);
    await delay(200);
    log(`hotkey field: ${await read(settings, `document.querySelector('input[placeholder="Press a key combination"]').value`)}`);
    key(settings, 'Delete');
    await delay(200);
    log(`hotkey after Delete: '${await read(settings, `document.querySelector('input[placeholder="Press a key combination"]').value`)}'`);
    key(settings, 'Escape');
    await waitFor(() => ctx.getSettings() === null);
    log('settings closed with Escape');
    await delay(300);
    log('done');
  } catch (exc) {
    log(`error: ${(exc as Error).stack ?? String(exc)}`);
  } finally {
    await clipboard.writeText(savedClipboard);
    ctx.quit();
  }
}
