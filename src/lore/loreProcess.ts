import { execFile, spawn } from 'child_process';

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

export interface RunLoreStreamingParams extends RunLoreParams {
  /** Called with each line emitted on stdout/stderr as it arrives (progress reporting). */
  onLine?: (line: string) => void;
}

/**
 * Run the lore CLI streaming its output line-by-line via `onLine` (for long operations like
 * clone, where the user wants live progress). Resolves with the full captured output.
 */
export function runLoreStreaming(params: RunLoreStreamingParams): Promise<LoreProcessResult> {
  const { bin, cwd, argv, throwOnError = true, onLine } = params;
  const fullArgs = [...argv, ...ALWAYS_ARGS];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, fullArgs, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let stdoutBuf = '';
    let stderrBuf = '';

    const pump = (chunk: string, which: 'out' | 'err') => {
      if (which === 'out') stdout += chunk; else stderr += chunk;
      let buf = which === 'out' ? stdoutBuf + chunk : stderrBuf + chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? ''; // keep the trailing partial line
      if (which === 'out') stdoutBuf = buf; else stderrBuf = buf;
      if (onLine) for (const line of lines) if (line.trim()) onLine(line);
    };

    child.stdout?.on('data', d => pump(d.toString(), 'out'));
    child.stderr?.on('data', d => pump(d.toString(), 'err'));
    child.on('error', err => reject(err));
    child.on('close', (code) => {
      // flush any trailing partial lines
      if (onLine) {
        if (stdoutBuf.trim()) onLine(stdoutBuf);
        if (stderrBuf.trim()) onLine(stderrBuf);
      }
      const exitCode = code ?? 0;
      const result: LoreProcessResult = { stdout, stderr, exitCode };
      if (exitCode !== 0 && throwOnError) {
        reject(new LoreCommandError(fullArgs, exitCode, stdout, stderr));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Heuristic: does this CLI error text indicate an authentication/authorization problem?
 * Used to surface a "run lore login" hint. (Heuristic only — confirm against a secured
 * server; the local dev server runs with auth disabled.)
 */
export function isLoreAuthError(message: string): boolean {
  return /\b(unauthor(i[sz]ed|ised)|authenticat|forbidden|permission denied|401|403|not logged in|login required|invalid token|expired token)\b/i.test(message);
}
