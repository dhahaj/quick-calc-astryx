// Run the end-to-end smoke test (electron/smoke.ts) against the built app.
// Uses a temporary APPDATA so a real %APPDATA%\QuickCalc is never read or written.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'smoke-output'));
const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'quickcalc-smoke-'));

const result = spawnSync(electron, [root], {
  stdio: 'inherit',
  env: { ...process.env, APPDATA: appData, QUICKCALC_SMOKE_DIR: outDir },
  timeout: 60_000,
});
fs.rmSync(appData, { recursive: true, force: true });

const log = path.join(outDir, 'smoke.log');
console.log(fs.existsSync(log) ? fs.readFileSync(log, 'utf-8') : 'no smoke log written');
process.exit(result.status ?? 1);
