import { execFile } from 'child_process';

/** Result of running the lore CLI once. */
export interface LoreProcessResult {
  stdout: string;
  stderr: string;
  /** Process exit code (0 = success). */
  exitCode: number;
}

/** Thrown when the lore CLI exits non-zero. Carries captured output for diagnostics. */
export class LoreCommandError extends Error {
  constructor(
    public readonly argv: string[],
    public readonly exitCode: number,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(`lore ${argv.join(' ')} exited ${exitCode}: ${stderr || stdout}`.trim());
    this.name = 'LoreCommandError';
  }
}

/**
 * Global flags we ALWAYS pass (learned from real runs, see docs/lore-cli-output-samples.md):
 *  --non-interactive : never block on a prompt (per-link commit messages, etc.)
 *  -P / --no-pager   : never invoke a pager (would hang a spawned process)
 */
const ALWAYS_ARGS = ['--non-interactive', '-P'];

const DEFAULT_MAX_BUFFER = 1024 * 1024 * 64; // 64 MiB — diffs/history can be large.

export interface RunLoreParams {
  /** Absolute path to the lore executable. */
  bin: string;
  /**
   * Working directory for the process. MUST be the repository root: lore resolves file-path
   * arguments (stage/diff/status <path>) relative to CWD, NOT to --repository. A wrong CWD
   * makes stage silently no-op with "Ignoring invalid path".
   */
  cwd: string;
  /** The subcommand and its arguments, e.g. ['status', '--scan'] or ['stage', 'a.txt']. */
  argv: string[];
  /** Throw LoreCommandError on non-zero exit (default true). */
  throwOnError?: boolean;
  maxBuffer?: number;
}

/**
 * Run the lore CLI once in `cwd`, returning captured output. Pure I/O — no command-state
 * notification (LoreClient layers that on top).
 */
export function runLore(params: RunLoreParams): Promise<LoreProcessResult> {
  const { bin, cwd, argv, throwOnError = true, maxBuffer = DEFAULT_MAX_BUFFER } = params;
  const fullArgs = [...argv, ...ALWAYS_ARGS];
  return new Promise((resolve, reject) => {
    execFile(bin, fullArgs, { cwd, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      const exitCode = error && typeof (error as any).code === 'number' ? (error as any).code : (error ? 1 : 0);
      const result: LoreProcessResult = { stdout: stdout ?? '', stderr: stderr ?? '', exitCode };
      if (error && throwOnError) {
        reject(new LoreCommandError(fullArgs, exitCode, result.stdout, result.stderr));
      } else {
        resolve(result);
      }
    });
  });
}
