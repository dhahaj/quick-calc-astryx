/** The theme menu matches the themes `astryx theme add` generated, and none of them loads remote fonts. */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, test } from 'vitest';

import { defaultSettings, settingsFromData } from '../src/shared/settings';
import { COLOR_THEMES, DEFAULT_COLOR_THEME, colorThemeInfo } from '../src/shared/themes';

const root = path.join(__dirname, '..');
const generated = fs.readFileSync(path.join(root, 'src', 'astryx-themes.ts'), 'utf-8');
const record = JSON.parse(/@astryx-theme-record (\{.*\})/.exec(generated)?.[1] ?? '{}') as {
  themes: Record<string, string>;
  defaultThemeSlug: string;
};

describe('theme menu', () => {
  test('every entry points at a generated Astryx theme', () => {
    for (const theme of COLOR_THEMES) expect(Object.keys(record.themes), theme.value).toContain(theme.astryx);
  });

  test('every generated theme is offered', () => {
    const offered = new Set<string>(COLOR_THEMES.map((t) => t.astryx));
    for (const slug of Object.keys(record.themes)) expect(offered.has(slug), slug).toBe(true);
  });

  test('values are unique and the default comes first', () => {
    const values = COLOR_THEMES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values[0]).toBe(DEFAULT_COLOR_THEME);
    expect(colorThemeInfo(DEFAULT_COLOR_THEME).astryx).toBe(record.defaultThemeSlug);
  });

  test('backgrounds match the theme stylesheets', () => {
    for (const theme of COLOR_THEMES) {
      const css = fs.readFileSync(path.join(root, 'node_modules', record.themes[theme.astryx], 'dist', 'theme.css'), 'utf-8');
      const body = /--color-background-body: ([^;]*);/.exec(css)?.[1] ?? '';
      const [light, dark] = theme.background;
      const expected = light === dark ? light : `light-dark(${light}, ${dark})`;
      expect(body.toLowerCase(), theme.value).toBe(expected.toLowerCase());
    }
  });
});

describe('no remote fonts', () => {
  test('the only fonts.css imports are the ones vite.config.ts replaces', () => {
    const imports = [...generated.matchAll(/import "([^"]+\.css)"/g)].map((m) => m[1]);
    const remote = imports.filter((spec) => spec.endsWith('/fonts.css'));
    expect(remote.length).toBeGreaterThan(0);
    for (const spec of remote) expect(spec).toMatch(/^@astryxdesign\/theme-[\w-]+\/fonts\.css$/);
  });

  test('the bundled font stylesheets point at local files', () => {
    const fonts = fs.readFileSync(path.join(root, 'src', 'renderer', 'fonts.ts'), 'utf-8');
    for (const [, spec] of fonts.matchAll(/import '([^']+)'/g)) {
      const css = fs.readFileSync(path.join(root, 'node_modules', spec), 'utf-8');
      expect(css, spec).not.toMatch(/https?:\/\//);
    }
  });
});

describe('setting', () => {
  test('defaults to the QuickCalc look', () => {
    expect(defaultSettings().color_theme).toBe('quickcalc');
  });

  test('an original-app settings file without the key gets the default', () => {
    expect(settingsFromData({ theme: 'dark', sig_figs: 6 }).color_theme).toBe('quickcalc');
  });

  test('known themes are kept, anything else falls back', () => {
    expect(settingsFromData({ color_theme: 'matcha' }).color_theme).toBe('matcha');
    expect(settingsFromData({ color_theme: 'neon' }).color_theme).toBe('quickcalc');
    expect(settingsFromData({ color_theme: 5 }).color_theme).toBe('quickcalc');
  });
});
