import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Resolve the path to the `lore` executable. Order:
 *   1. LORE_BIN environment variable (explicit override).
 *   2. <home>/bin/lore[.exe] — where the install script drops it by default.
 *   3. bare 'lore' — relies on PATH (execFile will resolve it).
 *
 * TODO: surface this as a setting (like a configurable git path) and an IPC handler, so the
 * user can point ugit at a custom lore binary. For now this covers the standard install.
 */
export function resolveLoreBin(): string {
  const envBin = process.env.LORE_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;

  const exe = process.platform === 'win32' ? 'lore.exe' : 'lore';
  const homeBin = path.join(os.homedir(), 'bin', exe);
  if (fs.existsSync(homeBin)) return homeBin;

  return 'lore';
}
