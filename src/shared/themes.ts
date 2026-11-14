/**
 * The colour themes offered in Settings. Each one is an Astryx theme package; "QuickCalc"
 * is Astryx's neutral theme with the original app's blue accent and Segoe UI text, and is
 * the default so an upgrade looks exactly as before.
 */

export interface ColorThemeInfo {
  /** Value stored in settings.json as "color_theme". */
  readonly value: string;
  readonly label: string;
  readonly description: string;
  /** The Astryx theme slug (a key of src/astryx-themes.ts). */
  readonly astryx: string;
  /** Window background before the page paints: [light, dark]. */
  readonly background: readonly [string, string];
}

export const COLOR_THEMES = [
  { value: 'quickcalc', label: 'QuickCalc', description: 'Neutral greys with the classic blue accent', astryx: 'neutral', background: ['#f1f1f1', '#1b1b1b'] },
  { value: 'neutral', label: 'Neutral', description: 'Restrained warm greys, Figtree type', astryx: 'neutral', background: ['#f1f1f1', '#1b1b1b'] },
  { value: 'butter', label: 'Butter', description: 'Creamy yellows with a blue accent', astryx: 'butter', background: ['#fdfbe4', '#261a13'] },
  { value: 'chocolate', label: 'Chocolate', description: 'Rich browns and cosy beige', astryx: 'chocolate', background: ['#fffcf7', '#141010'] },
  { value: 'gothic', label: 'Gothic', description: 'Deep blue-greys; always dark', astryx: 'gothic', background: ['#101314', '#101314'] },
  { value: 'matcha', label: 'Matcha', description: 'Earthy greens, calm and organic', astryx: 'matcha', background: ['#f0f0e0', '#12140e'] },
  { value: 'stone', label: 'Stone', description: 'Warm stone and slate', astryx: 'stone', background: ['#f0f0f7', '#101018'] },
  { value: 'y2k', label: 'Y2K', description: 'Periwinkle and hot pink, Poppins type', astryx: 'y2k', background: ['#cccffa', '#0e0f1a'] },
] as const satisfies readonly ColorThemeInfo[];

export type ColorTheme = (typeof COLOR_THEMES)[number]['value'];

export const DEFAULT_COLOR_THEME: ColorTheme = 'quickcalc';

export function isColorTheme(value: unknown): value is ColorTheme {
  return COLOR_THEMES.some((t) => t.value === value);
}

export function colorThemeInfo(value: ColorTheme): ColorThemeInfo {
  return COLOR_THEMES.find((t) => t.value === value) ?? COLOR_THEMES[0];
}
