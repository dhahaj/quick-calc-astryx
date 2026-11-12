/** The separate settings window (Electron). */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ThemeChoice } from '../shared/settings';
import { AppTheme } from './AppTheme';
import { bridge } from './bridge';
import { SettingsPanel } from './SettingsPanel';

export function SettingsWindow() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void bridge.getSettingsState().then((state) => setTheme(state.settings.theme));
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
    <AppTheme theme={theme}>
      <div ref={rootRef} className="qc-settings-window">
        <SettingsPanel onDone={() => bridge.closeSettings()} />
      </div>
    </AppTheme>
  );
}
