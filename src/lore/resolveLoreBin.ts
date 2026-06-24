import fs from 'fs';
import os from 'os';
import path from 'path';

// User-configured path (from Settings → Lore), mirrored here so the sync resolver can use it.
let configuredBin: string | null = null;

/** Set (or clear) the user-configured `lore` binary path. Called when settings load/change. */
export function setLoreBinOverride(binPath: string | null | undefined): void {
  configuredBin = binPath && binPath.trim() ? binPath.trim() : null;
}

/**
 * Resolve the path to the `lore` executable. Order:
 *   1. The path configured in Settings → Lore (if set and it exists).
 *   2. LORE_BIN environment variable (explicit override).
 *   3. <home>/bin/lore[.exe] — where the install script drops it by default.
 *   4. bare 'lore' — relies on PATH (execFile will resolve it).
 */
export function resolveLoreBin(): string {
  if (configuredBin && fs.existsSync(configuredBin)) return configuredBin;

  const envBin = process.env.LORE_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;

  const exe = process.platform === 'win32' ? 'lore.exe' : 'lore';
  const homeBin = path.join(os.homedir(), 'bin', exe);
  if (fs.existsSync(homeBin)) return homeBin;

  return 'lore';
}

// User-configured `loreserver` path (from Settings → Lore), mirrored for the sync resolver.
let configuredServerBin: string | null = null;

/** Set (or clear) the user-configured `loreserver` binary path. */
export function setLoreServerOverride(binPath: string | null | undefined): void {
  configuredServerBin = binPath && binPath.trim() ? binPath.trim() : null;
}

/**
 * Resolve the path to the `loreserver` executable. Order: Settings path → LORE_SERVER_BIN env →
 * <home>/bin/loreserver[.exe] → bare 'loreserver' (PATH).
 */
export function resolveLoreServerBin(): string {
  if (configuredServerBin && fs.existsSync(configuredServerBin)) return configuredServerBin;

  const envBin = process.env.LORE_SERVER_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;

  const exe = process.platform === 'win32' ? 'loreserver.exe' : 'loreserver';
  const homeBin = path.join(os.homedir(), 'bin', exe);
  if (fs.existsSync(homeBin)) return homeBin;

  return 'loreserver';
}
