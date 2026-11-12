import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import type { ReactNode } from 'react';

import type { ThemeChoice } from '../shared/settings';

/** Astryx's neutral theme, in the light/dark mode the user picked ("system" follows Windows). */
export function AppTheme({ theme, children }: { theme: ThemeChoice; children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode={theme}>
      {children}
    </Theme>
  );
}
