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
  // The main process shows and places the window on the first size report, so nothing is
  // reported until the form has loaded in its saved theme and the window can open at its
  // real size.
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  const report = useCallback(() => {
    const root = rootRef.current;
    if (!root || !loadedRef.current) return;
    const rect = root.getBoundingClientRect();
    bridge.resize(Math.ceil(rect.width), Math.ceil(rect.height));
  }, []);

  const onLoaded = useCallback(() => setLoaded(true), []);

  // Runs after the loaded form and its theme are on the page (the theme's own layout effect,
  // in a child, has already run).
  useLayoutEffect(() => {
    if (!loaded || loadedRef.current) return;
    loadedRef.current = true;
    report();
  }, [loaded, look, report]);

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
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, [report]);

  return (
    <AppTheme theme={look.theme} colorTheme={look.colorTheme}>
      <div ref={rootRef} className="qc-settings-window">
        <SettingsPanel onDone={() => bridge.closeSettings()} onPreview={preview} onLoaded={onLoaded} />
      </div>
    </AppTheme>
  );
}
