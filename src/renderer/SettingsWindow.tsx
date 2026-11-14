/** The separate settings window (Electron). */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ThemeChoice } from '../shared/settings';
import { type ColorTheme, DEFAULT_COLOR_THEME } from '../shared/themes';
import { AppTheme } from './AppTheme';
import { bridge } from './bridge';
import { SettingsPanel } from './SettingsPanel';

export function SettingsWindow() {
  // The window previews the theme being chosen; the calculator changes only on OK.
  const [look, setLook] = useState<{ colorTheme: ColorTheme; theme: ThemeChoice }>({
    colorTheme: DEFAULT_COLOR_THEME,
    theme: 'system',
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const preview = useCallback((colorTheme: ColorTheme, theme: ThemeChoice) => setLook({ colorTheme, theme }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape cancels, like a dialog — unless a dropdown inside the form handled it.
      if (e.key === 'Escape' && !e.defaultPrevented) bridge.closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => {
      const rect = root.getBoundingClientRect();
      bridge.resize(Math.ceil(rect.width), Math.ceil(rect.height));
    };
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <AppTheme theme={look.theme} colorTheme={look.colorTheme}>
      <div ref={rootRef} className="qc-settings-window">
        <SettingsPanel onDone={() => bridge.closeSettings()} onPreview={preview} />
      </div>
    </AppTheme>
  );
}
