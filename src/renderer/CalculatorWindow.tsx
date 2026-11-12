/** The calculator window: input line, live result, history and the optional keypad. */

import { Dialog } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Calculator, History, Settings as SettingsIcon, X } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Engine } from '../engine';
import type { InitData } from '../shared/bridge';
import { type HistoryEntry, type Settings, addHistoryEntry, formatSettingsOf } from '../shared/settings';
import { AppTheme } from './AppTheme';
import { bridge, isElectron, webSettingsRequested } from './bridge';
import { HistoryList } from './HistoryList';
import { Keypad } from './Keypad';
import { SettingsPanel } from './SettingsPanel';

type ResultState = 'preview' | 'result' | 'error';

interface ResultLine {
  text: string;
  state: ResultState;
  alt: string | null;
}

const EMPTY_RESULT: ResultLine = { text: '', state: 'preview', alt: null };

export function CalculatorWindow({ init }: { init: InitData }) {
  const [settings, setSettings] = useState<Settings>(init.settings);
  const [history, setHistory] = useState<HistoryEntry[]>(init.history);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ResultLine>(EMPTY_RESULT);
  const [webSettingsOpen, setWebSettingsOpen] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new Engine({
      customUnits: init.customUnits,
      format: formatSettingsOf(init.settings),
      degrees: init.settings.angle_mode === 'deg',
    });
  }
  const engine = engineRef.current;

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const historyRef = useRef(history);
  historyRef.current = history;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Keep the committed result on screen until typing resumes.
  const showingResult = useRef(false);
  // Position while cycling with Up/Down, and the unfinished line it started from.
  const navIndex = useRef<number | null>(null);
  const draft = useRef('');
  // Cursor position to restore after an insert from the keypad or history menu.
  const pendingSelection = useRef<number | null>(null);

  // ------------------------------------------------------------------ results

  const refreshPreview = useCallback(
    (value: string) => {
      if (showingResult.current) return;
      const trimmed = value.trim();
      const preview = trimmed ? engine.preview(value) : null;
      if (preview === null || preview.text === trimmed) setResult(EMPTY_RESULT);
      else setResult({ text: `= ${preview.text}`, state: 'preview', alt: preview.alt });
    },
    [engine],
  );

  /** Every change to the input line goes through here, as Qt's textChanged did. */
  const changeText = useCallback(
    (value: string) => {
      setText(value);
      textRef.current = value;
      if (showingResult.current && !value) return;
      showingResult.current = false;
      refreshPreview(value);
    },
    [refreshPreview],
  );

  const focusInput = () => inputRef.current?.focus();

  const saveHistory = (entries: HistoryEntry[]) => {
    setHistory(entries);
    historyRef.current = entries;
    bridge.saveHistory(entries);
  };

  const commit = () => {
    const line = textRef.current.trim();
    if (!line) return;
    const outcome = engine.evaluate(line);
    if (!outcome.ok) {
      showingResult.current = false;
      setResult({ text: outcome.display, state: 'error', alt: null });
      return;
    }
    saveHistory(addHistoryEntry(historyRef.current, { expr: outcome.expr, result: outcome.text, alt: outcome.alt }));
    navIndex.current = null;
    draft.current = '';
    showingResult.current = true;
    changeText('');
    setResult({ text: `= ${outcome.text}`, state: 'result', alt: outcome.alt });
    if (settingsRef.current.copy_on_enter) {
      const plain = { ...engine.format, thousandsSep: false, showIntBases: false };
      bridge.copy(engine.formatResult(outcome, plain));
    }
  };

  const clearInput = () => {
    showingResult.current = false;
    navIndex.current = null;
    draft.current = '';
    changeText('');
    setResult(EMPTY_RESULT);
    focusInput();
  };

  /** Insert at the cursor, replacing any selection (QLineEdit.insert). */
  const insert = (value: string) => {
    const input = inputRef.current;
    const current = textRef.current;
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? current.length;
    pendingSelection.current = start + value.length;
    changeText(current.slice(0, start) + value + current.slice(end));
    focusInput();
  };

  /** Delete the selection or the character before the cursor (QLineEdit.backspace). */
  const backspace = () => {
    const input = inputRef.current;
    const current = textRef.current;
    let start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? current.length;
    if (start === end) {
      if (start === 0) return;
      start = Array.from(current.slice(0, start)).slice(0, -1).join('').length;
    }
    pendingSelection.current = start;
    changeText(current.slice(0, start) + current.slice(end));
    focusInput();
  };

  useLayoutEffect(() => {
    if (pendingSelection.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingSelection.current, pendingSelection.current);
      pendingSelection.current = null;
    }
  }, [text]);

  /** Up / Down through earlier inputs, shell-style; the unfinished line is kept. */
  const navigate = (step: -1 | 1) => {
    const entries = historyRef.current;
    if (entries.length === 0) return;
    let index: number;
    if (navIndex.current === null) {
      if (step > 0) return;
      draft.current = textRef.current;
      index = entries.length - 1;
    } else {
      index = navIndex.current + step;
    }
    if (index < 0) return;
    if (index >= entries.length) {
      navIndex.current = null;
      changeText(draft.current);
      return;
    }
    navIndex.current = index;
    changeText(entries[index].expr);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigate(1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearInput();
    }
  };

  // ----------------------------------------------------------------- history

  const pickHistory = (entry: HistoryEntry) => {
    navIndex.current = null;
    changeText(entry.expr);
    focusInput();
  };

  const clearHistory = useCallback(() => {
    setHistory([]);
    historyRef.current = [];
    bridge.saveHistory([]);
    navIndex.current = null;
    inputRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------- settings

  const applySettings = useCallback(
    (next: Settings) => {
      setSettings(next);
      settingsRef.current = next;
      engine.format = formatSettingsOf(next);
      engine.degrees = next.angle_mode === 'deg';
      refreshPreview(textRef.current);
    },
    [engine, refreshPreview],
  );

  const toggle = (key: 'show_keypad' | 'show_history') => {
    const next = { ...settingsRef.current, [key]: !settingsRef.current[key] };
    applySettings(next);
    bridge.updateSettings({ [key]: next[key] });
  };

  const openSettings = () => bridge.openSettings();

  // -------------------------------------------------------------- lifecycle

  useEffect(() => {
    const offs = [
      bridge.onSettingsChanged(applySettings),
      bridge.onHistoryCleared(clearHistory),
      bridge.onShown(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }),
      webSettingsRequested.on(() => setWebSettingsOpen(true)),
    ];
    if (engine.warnings.length) bridge.notify('Custom units', engine.warnings.slice(0, 3).join('\n'), true);
    inputRef.current?.focus();
    return () => offs.forEach((off) => off());
  }, [applySettings, clearHistory, engine]);

  // Window-level shortcuts.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      const action =
        key === 'b' ? () => toggle('show_keypad')
        : key === 'h' ? () => toggle('show_history')
        : key === 'l' ? clearHistory
        : key === ',' ? openSettings
        : null;
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The frameless window takes the size of its content.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => {
      const rect = root.getBoundingClientRect();
      bridge.resize(Math.ceil(rect.width), Math.ceil(rect.height));
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <AppTheme theme={settings.theme}>
      <div ref={rootRef} className="qc-window" data-electron={isElectron || undefined}>
        <HStack vAlign="center" gap={0.5} className="qc-titlebar">
          <span className="qc-title">
            <Text type="label" size="xsm" weight="semibold" color="secondary">
              QuickCalc
            </Text>
          </span>
          <div className="qc-titlebar-buttons" onMouseDown={(e) => e.preventDefault()}>
            <ToggleButton
              label="Show or hide history (Ctrl+H)"
              icon={<Icon icon={History} size="sm" />}
              isIconOnly
              size="sm"
              isPressed={settings.show_history}
              onPressedChange={() => toggle('show_history')}
            />
            <ToggleButton
              label="Show or hide the keypad (Ctrl+B)"
              icon={<Icon icon={Calculator} size="sm" />}
              isIconOnly
              size="sm"
              isPressed={settings.show_keypad}
              onPressedChange={() => toggle('show_keypad')}
            />
            <IconButton
              label="Settings (Ctrl+,)"
              tooltip="Settings (Ctrl+,)"
              icon={<Icon icon={SettingsIcon} size="sm" />}
              variant="ghost"
              size="sm"
              onClick={openSettings}
            />
            {isElectron && (
              <IconButton label="Hide" tooltip="Hide" icon={<Icon icon={X} size="sm" />} variant="ghost" size="sm" onClick={() => bridge.hide()} />
            )}
          </div>
        </HStack>

        {settings.show_history && (
          <HistoryList
            entries={history}
            onPick={pickHistory}
            onInsert={insert}
            onCopy={(value) => bridge.copy(value)}
            onClear={clearHistory}
          />
        )}

        <TextInput
          ref={inputRef}
          label="Calculation"
          isLabelHidden
          value={text}
          onChange={(value) => changeText(value)}
          onEnter={commit}
          onKeyDown={onKeyDown}
          placeholder="Type a calculation…"
          size="lg"
          width="100%"
          hasAutoFocus
          hasSpellCheck={false}
          hasAutoCorrect={false}
          autoCapitalize="off"
          autoComplete="off"
          containerClassName="qc-input"
          controlClassName="qc-input-control"
        />

        <div className="qc-result" data-state={result.state} title={result.text.length > 30 ? result.text : undefined} aria-live="polite">
          {result.text || ' '}
        </div>
        {settings.show_int_bases && <div className="qc-alt">{result.alt || ' '}</div>}

        {settings.show_keypad && <Keypad onInsert={insert} onClear={clearInput} onBackspace={backspace} onEquals={commit} />}
      </div>

      {!isElectron && (
        <Dialog isOpen={webSettingsOpen} onOpenChange={setWebSettingsOpen} width={540} purpose="form" padding={0}>
          {webSettingsOpen && <SettingsPanel onDone={() => setWebSettingsOpen(false)} />}
        </Dialog>
      )}
    </AppTheme>
  );
}
