/** Exposes the small QuickCalc API to the windows. The pages get no Node or Electron access. */

import { contextBridge, ipcRenderer } from 'electron';

import type { QuickCalcBridge } from '../src/shared/bridge';

function subscribe<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const listener = (_event: unknown, ...args: unknown[]) => callback(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: QuickCalcBridge = {
  init: () => ipcRenderer.invoke('app:init'),
  updateSettings: (patch) => ipcRenderer.send('settings:update', patch),
  saveHistory: (entries) => ipcRenderer.send('history:save', entries),
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  hide: () => ipcRenderer.send('window:hide'),
  resize: (width, height) => ipcRenderer.send('window:resize', width, height),
  openSettings: () => ipcRenderer.send('settings:open'),
  notify: (title, text, warning) => ipcRenderer.send('app:notify', title, text, warning),
  onSettingsChanged: (callback) => subscribe('settings:changed', callback),
  onHistoryCleared: (callback) => subscribe('history:cleared', callback),
  onShown: (callback) => subscribe('window:shown', callback),

  getSettingsState: () => ipcRenderer.invoke('settings:state'),
  submitSettings: (settings, system) => ipcRenderer.invoke('settings:submit', settings, system),
  closeSettings: () => ipcRenderer.send('settings:close'),
  clearHistory: () => ipcRenderer.send('history:clear'),
  openUnitsFile: () => ipcRenderer.send('units:open'),
  suspendHotkey: (suspended) => ipcRenderer.send('hotkey:suspend', suspended),
};

contextBridge.exposeInMainWorld('quickcalc', api);
