# QuickCalc (Astryx edition)

A tiny calculator that lives in the Windows system tray, appears on a global hotkey
(`Ctrl+Alt+C`), takes typed maths the way you'd write it, and gets out of the way again.
Built for electronics work: SI prefixes, engineering notation, hex/binary, units and
mil ↔ mm conversions.

This is a rebuild of [quick-calc](https://github.com/dhahaj/quick-calc) with the same
behaviour, keys, syntax and settings, using **[Meta Astryx](https://github.com/meta/astryx)**
(React 19 + StyleX, neutral theme) for the interface and Electron for the tray, hotkey and
windows. The calculation engine is a TypeScript port of the original, checked against the
original's full pytest suite (ported to Vitest, 523 tests).

```
2(3+4)              = 14            4.7k || 10k        = 3197
9 V / 4.7 kohm      = 1.915 mA      10 mil to mm       = 0.254 mm
72 F to C           = 22.22 °C      0xFF + 0b1010      = 265
1/(2 pi * 1 kohm * 100 nF) = 1.592 kHz                 255 to hex = 0xFF
```

(Shown at 4 significant figures; the default is 10.)

No installer, no admin rights, no network access, no telemetry, no update checks.

## Run from source

Needs Node.js 22 or newer on Windows.

```
npm install
npm start
```

`npm start` builds and launches the app. Arguments work as before:
`npx electron . --tray` starts hidden in the tray; `--quit` closes the running copy.

`npm run dev:web` serves just the interface in a browser (Vite, port 5317), with settings
and history kept in the browser's storage; there is no tray, hotkey or registry there.

```
npm test            # engine, settings and hotkey tests (Vitest)
npm run typecheck   # TypeScript
npm run smoke       # drives the real Electron windows and saves screenshots to smoke-output\
```

The smoke test points `APPDATA` at a temporary folder, so it never touches your real
`%APPDATA%\QuickCalc`, and it does not register the global hotkey.

## Build the portable app

```
npm run dist
```

This produces `release\win-unpacked\` with `QuickCalc.exe`. Copy that folder anywhere under
your user profile and run `QuickCalc.exe`. To remove it: quit from the tray, delete the
folder, and optionally delete `%APPDATA%\QuickCalc`.

## Using it

| Key | Action |
|---|---|
| `Ctrl+Alt+C` (global) | Show / hide the window on the monitor under the mouse |
| `Enter` | Commit: add to history, copy the result to the clipboard |
| `Esc` | Clear the input line |
| `Up` / `Down` | Cycle through earlier inputs |
| `Ctrl+B` | Show / hide the button keypad |
| `Ctrl+H` | Show / hide history |
| `Ctrl+L` | Clear history |
| `Ctrl+,` | Settings |

The result preview updates as you type; half-typed input just shows nothing. Click a
history row to put it back in the input; right-click for insert / copy / clear. Drag the
title strip to move the window. A missing `)` at the end of a line is forgiven.

The tray icon menu has Show, Settings, Start with Windows and Quit. Launching QuickCalc
again while it is running simply shows the running copy.

### Changing the hotkey

Tray icon → **Settings…** → click the **Global hotkey** box and press the new combination
(at least one of Ctrl / Alt / Shift / Win plus a key, or a bare function key). Backspace
clears the box; **Default** restores `Ctrl+Alt+C`. You can also edit `"hotkey"` in
`%APPDATA%\QuickCalc\settings.json` while QuickCalc is closed, e.g. `"Ctrl+Shift+Space"`.
If Windows refuses the combination because another program owns it, a tray notification
says so and the previous hotkey stays active.

The hotkey uses Electron's `globalShortcut` (Win32 `RegisterHotKey`); there is no keyboard hook.

### Themes

Settings → **Theme** picks the look; **Appearance** picks Follow Windows, Dark or Light.

| Theme | Look |
|---|---|
| QuickCalc (default) | Astryx neutral with the original app's blue accent and Segoe UI |
| Neutral | Restrained warm greys, Figtree type |
| Butter | Creamy yellows with a blue accent, Outfit type |
| Chocolate | Rich browns and cosy beige, Albert Sans with Fraunces headings |
| Gothic | Deep blue-greys, Fustat type; always dark |
| Matcha | Earthy greens, DM Sans with Playwrite headings |
| Stone | Warm stone and slate, Figtree with Montserrat headings |
| Y2K | Periwinkle and lime, Poppins type |

The settings window previews the theme as you choose it; the calculator changes on OK.
The choice is saved as `"color_theme"` in `settings.json` (the original app ignores it).

The themes are Astryx packages, registered with `npx astryx theme add <name>`, which
generates `src/astryx-themes.ts`. Their typefaces are bundled with the app
(`src/renderer/fonts.ts`); the themes' own `fonts.css`, which would load them from Google
Fonts, is left out of the build, so QuickCalc still makes no network requests.

### Calculator key (optional, built exe only)

Settings → **Open QuickCalc with the keyboard's Calculator key** writes one per-user
registry value:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\AppKey\18
    ShellExecute = <path to QuickCalc.exe>
```

To undo it, untick the box, or delete the key by hand:

```
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\AppKey\18" /f
```

The option is disabled when running from source because the override can only hold a
single program path. "Start with Windows" likewise uses only
`HKCU\...\CurrentVersion\Run` (value `QuickCalc`), the same entry the original used.

## Syntax

### Operators, loosest to tightest

| Operator | Meaning |
|---|---|
| `name = expr` | assign a variable (session only) |
| `to`, `in`, `->` | convert the whole line: `5 in + 1 ft to mm` |
| `\|` | bitwise or |
| `xor` | bitwise xor |
| `&` | bitwise and |
| `<<` `>>` | shifts |
| `+` `-` | add, subtract |
| `*` `/` `mod` `%` | multiply, divide, modulo |
| `\|\|` | parallel: `a*b/(a+b)` |
| `-x` `+x` `~x` | negate, bitwise not |
| *adjacency* | implicit multiplication: `2pi`, `2(3+4)`, `9 V`, `(1+2)(3+4)` |
| `^` `**` | power, right-associative: `2^3^2` = 512, `-2^2` = -4 |
| `x%` | percent |

- **Implicit multiplication binds tighter than `*` and `/`.** `9 V / 4.7 kohm` is
  9 V ÷ (4.7 kΩ) and `1/2pi` is 1/(2π). Write `(1/2) pi` if you mean the other thing.
- **`||` binds tighter than `*` and `/`**, so `9 / 4.7k || 10k` divides by the parallel pair.

`^` is always power; use `xor` for exclusive-or. `~` follows two's-complement rules
(`~5` = -6). Whole numbers are exact at any size (`2^64` = 18446744073709551616); bitwise
operators need whole numbers. Unicode `× ÷ − · π √ ² ³ → µ Ω °` are understood.

### `ans`, percent, numbers

- `ans` is the last result. A line starting with `* / + ^ || & | << >> xor mod` or
  `to` / `in` / `->` is applied to `ans`. A leading `-` is **not**: `-5 + 3` is −2.
- `a + b%` and `a - b%` add or subtract *b percent of a* (`200 + 10%` → 220); anywhere
  else `b%` is `b/100`; `%` followed by a number, name or `(` is modulo.
- `0xFF`, `0b1010`, `0o17`, `1e-6`, `1_000_000`, `.5`.

### SI prefixes on numbers

A single prefix letter directly after a number, with no space, scales it:
`f p n u/µ m k M G T`. `4.7k` → 4700, `100n` → 1e-7, `10M` → 10 000 000.

`m`, `G` and `T` are also units (metre, gauss, tesla): with a space it is always the
unit; glued with no other units on the line it is the prefix (`10m` → 0.01); glued with
other units or a conversion on the line it is the unit (`10m to ft`, `3m + 20cm`); and if
the chosen reading gives a unit mismatch, the other one is tried.

### Functions and constants

`sqrt cbrt abs round floor ceil log ln log2 exp sin cos tan asin acos atan atan2 min max`,
plus `pi`, `e`. `log` is base 10 (`log(8, 2)` for another base); `round(x, 2)` rounds to
two decimals. Trig uses radians or degrees according to Settings; an explicit unit always
wins: `sin(30 deg)`, `sin(30°)`.

### Units

`m mm um in ft yd mi mil thou nmi`, `g kg lb oz t`, `s ms min h day week year`,
`L mL gal qt pt cup floz tbsp tsp`, `V A ohm Ω F H W J Hz S C Wb T G`,
`N lbf kgf Pa psi bar atm torr mmHg`, `mph kph knot c`, `deg rad turn rpm`,
`B kB MB GB KiB MiB GiB bit kb Mb Mbps`, `sqft sqin acre ha`,
`cal kcal BTU kWh Wh mAh eV hp`, `dBm dBW`, `K degC degF °C °F`, and any SI or binary
prefix on any unit (`kΩ`, `µF`, `GHz`, `MiB`). Plurals work (`meters`, `hours`).

- **Convert** with `to`, `in` or `->`: `60 mph to km/h`, `1 GiB in MB`, `10 mil -> mm`.
- **Arithmetic keeps units**, and results are tidied: `9 V / 4.7 kohm` → mA,
  `60 mph * 2 h` → 120 mi, `1/(1 kHz)` → 1 ms, `500 mA * 2 h` → 1 Ah.
- **`in` is inch or the keyword**: `5 in in mm`, `5 mm in in` and `5 in * 2` all work.
- **Temperature**: `72 F to C`, `100 C to K`, `72 °F to °C`; `20 degC + 5 degC` → 25 °C.
- **Compound input**: `5 ft 3 in to cm` → 160.02 cm.
- **Bases**: `255 to hex`, `0x3F to bin`, `42 to oct`, `0xFF to dec`.
- Bare `k`, `u`, `M`, `R`, `a` are not units; a variable shadows a unit of the same name.

The unit table is a built-in, Pint-compatible registry (same names, symbols and
conversions as the original). One improvement: tesla ↔ gauss now converts.

### Custom units

`%APPDATA%\QuickCalc\units.txt` is created on first run with commented examples
(Settings → **Edit custom units…** opens it). One Pint-style definition per line:

```
oz_cu = 1.37 * thou          # copper weight: 2 oz_cu to mm -> 0.069596 mm
rack_unit = 1.75 * inch = RU
```

Restart QuickCalc after editing. A line that can't be read is skipped and reported in a
tray notification; it never stops the app from starting.

## Output formatting

| Mode | `3.3 / 4.7k` | `9 V / 4.7 kohm` |
|---|---|---|
| Auto | `0.0007021276596` | `1.914893617 mA` |
| Engineering / SI | `702.1276596 µ` | `1.914893617 mA` |
| Scientific | `7.021276596e-4` | `1.914893617e-3 A` |
| Fixed (4) | `0.0007` | `0.0019 A` |

Rounding uses the exact binary value and rounds half to even, digit for digit like the
original. Optional thousands separators and hex + binary under whole numbers; the
clipboard always gets the number without separators.

## Files

Everything QuickCalc writes is in `%APPDATA%\QuickCalc`, in the same format as the
original, so an existing folder keeps its settings and history:

| File | Contents |
|---|---|
| `settings.json` | all settings |
| `history.json` | up to 500 history entries (if "Remember history" is on) |
| `units.txt` | your custom units |
| `electron\` | the browser engine's own cache |

## Project layout

```
src/
  engine/      lexer, parser, evaluator, units registry, formatter. No UI imports.
  shared/      settings/history data and hotkey parsing (used by both processes)
  renderer/    the Astryx React UI: calculator window, keypad, history, settings
  astryx-themes.ts  generated by `astryx theme add`
electron/      main process (tray, hotkey, windows, IPC), preload, files, registry
tests/         Vitest port of the original pytest suite
```

The engine can be used on its own:

```ts
import { Engine } from './src/engine';
new Engine().evaluate('9 V / 4.7 kohm').text; // '1.914893617 mA'
```

Input is parsed by a hand-written tokenizer and recursive-descent parser; `eval()` is
never used.

## Known limits

- Conversions can't be nested in parentheses: write `5 in * 2 to mm`.
- Variables and `ans` last until you quit; only the history is saved.
- Fractions are ordinary double precision, displayed to at most 15 significant figures.
