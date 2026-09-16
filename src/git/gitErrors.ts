import { GitError, SimpleGitOptions } from 'simple-git';

/** Longest git error message surfaced to the UI, in characters. */
const MAX_MESSAGE_LENGTH = 2000;

/**
 * A failed git command. Extends simple-git's GitError so simple-git keeps the
 * instance intact while it unwinds the task queue.
 */
export class GitCommandError extends GitError {
  constructor(
    message: string,
    public readonly stdOut: string,
    public readonly stdErr: string,
    public readonly exitCode: number
  ) {
    super(undefined, message);
    this.name = 'GitCommandError';
  }
}

/**
 * By default simple-git builds the error message from stdout and stderr concatenated,
 * so a command that fails part way through - `git log` hitting a missing object, say -
 * produces an error message containing every line it did manage to print. Keep the
 * message to git's own stderr and hang the partial stdout off the error instead.
 */
export const gitErrorHandler: SimpleGitOptions['errors'] = (error, result) => {
  // A falsy error means simple-git doesn't consider this run a failure; leave it alone.
  if (!error) {
    return error;
  }

  const stdOut = Buffer.concat(result.stdOut).toString('utf8');
  const stdErr = Buffer.concat(result.stdErr).toString('utf8');
  const detail = stdErr.trim() || (Buffer.isBuffer(error) ? error.toString('utf8') : error.message).trim();
  const message = detail || `git exited with code ${result.exitCode}`;

  return new GitCommandError(
    message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...` : message,
    stdOut,
    stdErr,
    result.exitCode
  );
};
