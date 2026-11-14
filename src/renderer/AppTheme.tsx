import { Theme } from '@astryxdesign/core/theme';
import { type ReactNode, useLayoutEffect } from 'react';

import { themes } from '../astryx-themes';
import type { ThemeChoice } from '../shared/settings';
import { type ColorTheme, colorThemeInfo } from '../shared/themes';

export interface AppThemeProps {
  /** Light / dark mode; "system" follows Windows. */
  theme: ThemeChoice;
  colorTheme: ColorTheme;
  children: ReactNode;
}

/** The chosen Astryx theme in the chosen light/dark mode. */
export function AppTheme({ theme, colorTheme, children }: AppThemeProps) {
  const slug = colorThemeInfo(colorTheme).astryx as keyof typeof themes;

  // The "QuickCalc" skin (blue accent, Segoe UI) is plain CSS keyed off <html>, so it also
  // reaches menus and tooltips that Astryx renders outside this subtree.
  useLayoutEffect(() => {
    document.documentElement.dataset.qcSkin = colorTheme;
  }, [colorTheme]);

  return (
    <Theme theme={themes[slug]} mode={theme}>
      {children}
    </Theme>
  );
}
