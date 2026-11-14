/** The settings form. It edits a copy; the settings are applied only on OK. */

import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { InputGroup } from '@astryxdesign/core/InputGroup';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';

import type { SettingsState } from '../shared/bridge';
import { hotkeyFromEvent, parseHotkey } from '../shared/hotkey';
import { DEFAULT_HOTKEY, type Settings } from '../shared/settings';
import { COLOR_THEMES, type ColorTheme } from '../shared/themes';
import { bridge } from './bridge';

const HINT = 'Click the box and press the new combination.';

function hotkeyStatus(text: string): { valid: boolean; message: string; warn: boolean } {
  const valid = Boolean(text) && parseHotkey(text) !== null;
  if (valid) return { valid, message: HINT, warn: false };
  if (!text) return { valid, message: 'No hotkey set; the previous one will be kept.', warn: false };
  return { valid, message: 'Use at least one of Ctrl, Alt, Shift or Win plus a key.', warn: true };
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="qc-settings-group">
      <Heading level={3} color="secondary" className="qc-settings-heading">
        {title}
      </Heading>
      {children}
    </section>
  );
}

export interface SettingsPanelProps {
  onDone(): void;
  /** Called as the theme choices change, so the settings window can show them before OK. */
  onPreview?(colorTheme: ColorTheme, theme: Settings['theme']): void;
}

export function SettingsPanel({ onDone, onPreview }: SettingsPanelProps) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [hotkey, setHotkey] = useState('');
  const [autostart, setAutostart] = useState(false);
  const [calculatorKey, setCalculatorKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void bridge.getSettingsState().then((loaded) => {
      setState(loaded);
      setDraft(loaded.settings);
      setHotkey(loaded.settings.hotkey);
      setAutostart(loaded.autostart);
      setCalculatorKey(loaded.calculatorKey);
    });
    return () => bridge.suspendHotkey(false);
  }, []);

  const previewColor = draft?.color_theme;
  const previewMode = draft?.theme;
  useEffect(() => {
    if (previewColor && previewMode) onPreview?.(previewColor, previewMode);
  }, [previewColor, previewMode, onPreview]);

  if (state === null || draft === null) return <div className="qc-settings" />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });
  const status = hotkeyStatus(hotkey);
  const fixed = draft.format_mode === 'fixed';

  const recordHotkey = (e: KeyboardEvent<HTMLInputElement>) => {
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    // Tab keeps keyboard navigation working; Escape still cancels the dialog.
    if ((e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) || (e.key === 'Escape' && plain)) return;
    e.preventDefault();
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      setHotkey('');
      return;
    }
    const recorded = hotkeyFromEvent(e);
    if (recorded !== null) setHotkey(recorded);
  };

  const submit = async () => {
    setSaving(true);
    const next: Settings = {
      ...draft,
      hotkey: hotkey && parseHotkey(hotkey) ? hotkey : state.settings.hotkey,
    };
    await bridge.submitSettings(next, { autostart, calculatorKey });
    onDone();
  };

  return (
    <div className="qc-settings">
      <VStack gap={4}>
        <Group title="Window">
          <FormLayout direction="horizontal-labels">
            <InputGroup
              label="Global hotkey"
              description={status.warn ? undefined : status.message}
              status={status.warn ? { type: 'error', message: status.message } : undefined}
            >
              <TextInput
                label="Key combination"
                value={hotkey}
                onChange={() => undefined}
                onKeyDown={recordHotkey}
                onFocus={() => bridge.suspendHotkey(true)}
                onBlur={() => bridge.suspendHotkey(false)}
                placeholder="Press a key combination"
                hasSpellCheck={false}
                autoComplete="off"
              />
              <Button label="Default" onClick={() => setHotkey(DEFAULT_HOTKEY)} />
            </InputGroup>
            <Selector
              label="Open at"
              value={draft.position}
              onChange={(v) => set('position', v as Settings['position'])}
              options={[
                { value: 'center', label: 'Centre of the screen' },
                { value: 'last', label: 'Where I left it' },
              ]}
            />
            <Selector
              label="Theme"
              value={draft.color_theme}
              onChange={(v) => set('color_theme', v as ColorTheme)}
              options={COLOR_THEMES.map(({ value, label, description }) => ({ value, label, description }))}
            />
            <Selector
              label="Appearance"
              value={draft.theme}
              onChange={(v) => set('theme', v as Settings['theme'])}
              options={[
                { value: 'system', label: 'Follow Windows' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </FormLayout>
          <VStack gap={2} className="qc-settings-checks">
            <CheckboxInput label="Hide when the window loses focus" value={draft.hide_on_focus_loss} onChange={(v) => set('hide_on_focus_loss', v)} />
            <CheckboxInput label="Show the button keypad (Ctrl+B)" value={draft.show_keypad} onChange={(v) => set('show_keypad', v)} />
            <CheckboxInput label="Show history (Ctrl+H)" value={draft.show_history} onChange={(v) => set('show_history', v)} />
          </VStack>
        </Group>

        <Divider />

        <Group title="Calculation and output">
          <FormLayout direction="horizontal-labels">
            <Selector
              label="Angles"
              value={draft.angle_mode}
              onChange={(v) => set('angle_mode', v as Settings['angle_mode'])}
              options={[
                { value: 'rad', label: 'Radians' },
                { value: 'deg', label: 'Degrees' },
              ]}
            />
            <Selector
              label="Number format"
              value={draft.format_mode}
              onChange={(v) => set('format_mode', v as Settings['format_mode'])}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'eng', label: 'Engineering / SI prefixes' },
                { value: 'sci', label: 'Scientific' },
                { value: 'fixed', label: 'Fixed decimals' },
              ]}
            />
            <NumberInput
              label="Significant figures"
              value={draft.sig_figs}
              onChange={(v) => set('sig_figs', v)}
              min={1}
              max={15}
              isIntegerOnly
              hasNumberSteppers
              isDisabled={fixed}
            />
            <NumberInput
              label="Decimals (Fixed)"
              value={draft.fixed_decimals}
              onChange={(v) => set('fixed_decimals', v)}
              min={0}
              max={12}
              isIntegerOnly
              hasNumberSteppers
              isDisabled={!fixed}
            />
          </FormLayout>
          <VStack gap={2} className="qc-settings-checks">
            <CheckboxInput label="Thousands separators (1,234,567)" value={draft.thousands_sep} onChange={(v) => set('thousands_sep', v)} />
            <CheckboxInput label="Show hex and binary next to whole numbers" value={draft.show_int_bases} onChange={(v) => set('show_int_bases', v)} />
            <CheckboxInput label="Copy the result to the clipboard on Enter" value={draft.copy_on_enter} onChange={(v) => set('copy_on_enter', v)} />
          </VStack>
        </Group>

        <Divider />

        <Group title="History and Windows">
          <VStack gap={2} className="qc-settings-checks">
            <CheckboxInput label="Remember history between sessions" value={draft.persist_history} onChange={(v) => set('persist_history', v)} />
            <CheckboxInput label="Start with Windows" value={autostart} onChange={setAutostart} isDisabled={!window.quickcalc} />
            <CheckboxInput
              label="Open QuickCalc with the keyboard's Calculator key"
              value={calculatorKey}
              onChange={setCalculatorKey}
              isDisabled={!state.calculatorKeySupported}
            />
            {!state.calculatorKeySupported && (
              <Text type="supporting" color="secondary">
                The Calculator key option needs the built QuickCalc.exe (see the README).
              </Text>
            )}
          </VStack>
          <HStack gap={2} className="qc-settings-actions">
            <Button label="Edit custom units…" onClick={() => bridge.openUnitsFile()} isDisabled={!window.quickcalc} />
            <Button label="Clear history" onClick={() => bridge.clearHistory()} />
          </HStack>
        </Group>
      </VStack>

      <HStack gap={2} hAlign="end" className="qc-settings-footer">
        <Button label="Cancel" onClick={onDone} />
        <Button label="OK" variant="primary" onClick={() => void submit()} isDisabled={!(status.valid || !hotkey)} isLoading={saving} />
      </HStack>
    </div>
  );
}
