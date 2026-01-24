const GitAdapter = require('./GitAdapter');
const { execSync } = require('child_process');

/**
 * Git adapter implementation using direct git CLI commands
 */
class CliGitAdapter extends GitAdapter {
  constructor(repoPath) {
    super(repoPath);
  }

  async open() {
    await super.open();
    // No initialization needed for CLI adapter
  }

  _execGit(args) {
    const command = `git ${args.join(' ')}`;
    const startTime = performance.now();

    try {
      const result = execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      this._logCommand(command, startTime);
      return result;
    } catch (error) {
      this._logCommand(command, startTime);
      throw new Error(error.stderr || error.message);
    }
  }

  async status() {
    // Parse git status output
    const porcelainResult = this._execGit(['status', '--porcelain']);
    const branchResult = this._execGit(['rev-parse', '--abbrev-ref', 'HEAD']);

    const currentBranch = branchResult.trim();
    const files = [];

    if (porcelainResult.trim()) {
      const lines = porcelainResult.trim().split('\n');
      lines.forEach(line => {
        if (line.length < 3) return;

        const index = line[0];
        const working_dir = line[1];
        const path = line.substring(3);

        files.push({
          path,
          index: index === ' ' ? ' ' : index,
          working_dir: working_dir === ' ' ? ' ' : working_dir
        });
      });
    }

    return { current: currentBranch, files };
  }

  async branchLocal() {
    const result = this._execGit(['branch', '--format=%(refname:short)']);
    const branches = result.trim().split('\n').filter(Boolean);
    return { all: branches };
  }

  async getAheadBehind(localBranch, remoteBranch) {
    const result = this._execGit(['rev-list', '--left-right', '--count', `${localBranch}...${remoteBranch}`]);
    const [ahead, behind] = result.trim().split('\t').map(Number);
    return { ahead, behind };
  }

  async stashList() {
    try {
      const result = this._execGit(['stash', 'list', '--format=%H %gd: %gs']);
      if (!result.trim()) {
        return { all: [] };
      }

      const stashes = result.trim().split('\n').map(line => {
        const match = line.match(/^(\S+)\s+(.+)$/);
        if (match) {
          return { hash: match[1], message: match[2] };
        }
        return null;
      }).filter(Boolean);

      return { all: stashes };
    } catch (error) {
      return { all: [] };
    }
  }

  async fetch(remote) {
    this._execGit(['fetch', remote]);
  }

  async pull(remote, branch) {
    this._execGit(['pull', remote, branch]);
  }

  async push(remote, refspec, options = []) {
    const args = ['push', remote, refspec, ...options];
    this._execGit(args);
  }

  async stashPush(message, filePaths = null) {
    if (filePaths && filePaths.length > 0) {
      this._execGit(['stash', 'push', '-m', `"${message}"`, '--', ...filePaths]);
    } else {
      this._execGit(['stash', 'push', '-m', `"${message}"`]);
    }
  }

  async stashPop() {
    this._execGit(['stash', 'pop']);
  }

  async add(filePaths) {
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    this._execGit(['add', ...paths]);
  }

  async reset(filePaths) {
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    this._execGit(['reset', 'HEAD', ...paths]);
  }

  async commit(message) {
    // Escape double quotes in the message
    const escapedMessage = message.replace(/"/g, '\\"');
    this._execGit(['commit', '-m', `"${escapedMessage}"`]);
  }

  async diff(filePath, isStaged) {
    if (isStaged) {
      return this._execGit(['diff', '--cached', '--', filePath]);
    } else {
      return this._execGit(['diff', '--', filePath]);
    }
  }

  async showStash(stashIndex) {
    return this._execGit(['show', `stash@{${stashIndex}}`]);
  }

  async discard(filePaths) {
    this._execGit(['checkout', '--', ...filePaths]);
  }

  async checkoutBranch(branchName) {
    this._execGit(['checkout', branchName]);
  }

  async log(branchName, maxCount = 100) {
    const result = this._execGit([
      'log',
      branchName,
      `--max-count=${maxCount}`,
      '--format=%H%n%ai%n%an%n%ae%n%s%n%b%n<COMMIT_END>'
    ]);

    if (!result.trim()) {
      return [];
    }

    const commits = [];
    const commitBlocks = result.split('<COMMIT_END>');

    commitBlocks.forEach(block => {
      const lines = block.trim().split('\n');
      if (lines.length >= 5) {
        const hash = lines[0];
        const date = lines[1];
        const author_name = lines[2];
        const author_email = lines[3];
        const message = lines[4];
        const body = lines.slice(5).join('\n').trim();

        commits.push({
          hash,
          date,
          author_name,
          author_email,
          message,
          body: body || ''
        });
      }
    });

    return commits;
  }

  async getCommitFiles(commitHash) {
    try {
      const result = this._execGit(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash]);

      if (!result.trim()) {
        return [];
      }

      const files = result.trim().split('\n').map(line => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const status = parts[0];
          const path = parts[1];
          return { status, path };
        }
        return null;
      }).filter(Boolean);

      return files;
    } catch (error) {
      return [];
    }
  }

  async createPatch(filePaths, outputPath, isStaged = false) {
    const fs = require('fs');
    let patchContent;

    if (isStaged) {
      patchContent = this._execGit(['diff', '--cached', '--', ...filePaths]);
    } else {
      patchContent = this._execGit(['diff', '--', ...filePaths]);
    }

    fs.writeFileSync(outputPath, patchContent, 'utf8');
  }

  async raw(args) {
    return this._execGit(args);
  }
}

module.exports = CliGitAdapter;
