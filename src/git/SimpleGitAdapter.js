const simpleGit = require('simple-git');
const GitAdapter = require('./GitAdapter');
const fs = require('fs');
const path = require('path');

/**
 * Git adapter implementation using simple-git library
 */
class SimpleGitAdapter extends GitAdapter {
  constructor(repoPath, commandStateCallback = null) {
    super(repoPath, commandStateCallback);
    this.git = null;
    this.currentBranch = null;
  }

  async open() {
    this.git = simpleGit({ baseDir: this.repoPath });
    this.isOpen = true;
  }

  async status() {
    const startTime = performance.now();
    const id = this._startCommand('git status', startTime);
    const result = await this.git.status();
    this._endCommand(id, startTime);
    this.currentBranch = result.current; // Track current branch
    return result;
  }

  async branchLocal() {
    const startTime = performance.now();
    const id = this._startCommand('git branch --list', startTime);
    const result = await this.git.branchLocal();
    this._endCommand(id, startTime);
    return result;
  }

  async createBranch(branchName, startPoint = null) {
    const startTime = performance.now();
    let id;
    try {
      if (startPoint) {
        id = this._startCommand(`git branch ${branchName} ${startPoint}`, startTime);
        await this.git.branch([branchName, startPoint]);
        this._endCommand(id, startTime);
      } else {
        id = this._startCommand(`git branch ${branchName}`, startTime);
        await this.git.branch([branchName]);
        this._endCommand(id, startTime);
      }
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error creating branch ${branchName}:`, error);
      throw error;
    }
  }

  async getAheadBehind(localBranch, remoteBranch) {
    const startTime = performance.now();
    let id;
    try {
      id = this._startCommand(`git rev-list --left-right --count ${localBranch}...${remoteBranch}`, startTime);
      const result = await this.git.raw(['rev-list', '--left-right', '--count', `${localBranch}...${remoteBranch}`]);
      this._endCommand(id, startTime);
      const [ahead, behind] = result.trim().split('\t').map(Number);
      return { ahead, behind };
    } catch (error) {
      this._endCommand(id, startTime);
      return { ahead: -1, behind: -1 };
    }
  }

  async getOriginUrl() {
    const startTime = performance.now();
    let id;
    try {
      id = this._startCommand('git remote get-url origin', startTime);
      const result = await this.git.raw(['remote', 'get-url', 'origin']);
      this._endCommand(id, startTime);
      return result.trim();
    } catch (error) {
      this._endCommand(id, startTime);
      //console.error('Error getting origin URL:', error);
      return '';
    }
  }

  async resetToOrigin(branch) {
    const startTime = performance.now();
    let idFetch;
    let idReset;
    try {
      // Fetch latest from origin
      idFetch = this._startCommand('git fetch origin', startTime);
      await this.git.fetch('origin');
      this._endCommand(idFetch, startTime);

      // Hard reset to origin/branch
      idReset = this._startCommand(`git reset --hard origin/${branch}`, startTime);
      await this.git.raw(['reset', '--hard', `origin/${branch}`]);
      this._endCommand(idReset, startTime);
    } catch (error) {
      this._endCommand(idFetch, startTime);
      this._endCommand(idReset, startTime);
      console.error(`Error resetting to origin/${branch}:`, error);
      throw error;
    }
  }

  async stashList() {
    const startTime = performance.now();
    const id = this._startCommand('git stash list', startTime);
    const result = await this.git.stashList();
    this._endCommand(id, startTime);
    return result;
  }

  async fetch(remote) {
    const startTime = performance.now();
    const id = this._startCommand(`git fetch ${remote}`, startTime);
    await this.git.fetch(remote);
    this._endCommand(id, startTime);
  }

  async pull(remote, branch) {
    const startTime = performance.now();
    const id = this._startCommand(`git pull ${remote} ${branch}`, startTime);
    await this.git.pull(remote, branch);
    this._endCommand(id, startTime);
  }

  async push(remote, refspec, options = []) {
    const startTime = performance.now();
    if (options.length > 0) {
      const id = this._startCommand(`git push ${remote} ${refspec} ${options.join(' ')}`, startTime);
      await this.git.push(remote, refspec, options);
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git push ${remote} ${refspec}`, startTime);
      await this.git.push(remote, refspec);
      this._endCommand(id, startTime);
    }
  }

  async stashPush(message, filePaths = null) {
    const startTime = performance.now();
    if (filePaths && filePaths.length > 0) {
      const id = this._startCommand(`git stash push -m "${message}" -- ${filePaths.length} files`, startTime);
      await this.git.stash(['push', '-m', message, '--', ...filePaths]);
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git stash push -m "${message}"`, startTime);
      await this.git.stash(['push', '-m', message]);
      this._endCommand(id, startTime);
    }
  }

  async stashPop() {
    const startTime = performance.now();
    const id = this._startCommand('git stash pop', startTime);
    await this.git.stash(['pop']);
    this._endCommand(id, startTime);
  }

  async stashApply() {
    const startTime = performance.now();
    const id = this._startCommand('git stash apply', startTime);
    await this.git.stash(['apply']);
    this._endCommand(id, startTime);
  }

  async add(filePaths) {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const id = this._startCommand(`git add ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
    await this.git.add(paths);
    this._endCommand(id, startTime);
  }

  async reset(filePaths) {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const id = this._startCommand(`git reset HEAD ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
    await this.git.reset(['HEAD', ...paths]);
    this._endCommand(id, startTime);
  }

  async commit(message) {
    const startTime = performance.now();
    const id = this._startCommand(`git commit -m "${message}"`, startTime);
    await this.git.commit(message);
    this._endCommand(id, startTime);
  }

  async diff(filePath, isStaged) {
    const startTime = performance.now();
    let result;
    if (isStaged) {
      const id = this._startCommand(`git diff --cached --ignore-space-at-eol -- ${filePath}`, startTime);
      result = await this.git.diff(['--cached', '--ignore-space-at-eol', '--', filePath]);
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git diff --ignore-space-at-eol -- ${filePath}`, startTime);
      result = await this.git.diff(['--ignore-space-at-eol', '--', filePath]);
      this._endCommand(id, startTime);
    }
    //console.log(result);
    return result;
  }

  /**
   * Get detailed information about a git stash entry
   * @param {number} stashIndex - The stash index (default: 0 for most recent)
   * @param {string} repoPath - Path to the git repository (default: current directory)
   * @returns {Promise<Object>} Object containing stash information
   */
  async getStashInfo(stashIndex) {
    const stashRef = `stash@{${stashIndex}}`;
    const startTime = performance.now();
    const id = this._startCommand(`git show ${stashRef}`, startTime);
    try {
      // Get basic stash info using git show
      const showOutput = await this.git.show([stashRef]);

      // Get the list of files in the stash
      const stashShowOutput = await this.git.raw([
        'stash',
        'show',
        '--name-only',
        stashRef
      ]);

      const files = stashShowOutput
        .trim()
        .split('\n')
        .filter(file => file.length > 0);

      // Get diff for each file
      const fileDiffs = {};
      const info = {};

      showOutput.split('\n').forEach(line => {
        if (line.startsWith('commit ')) {
          const hash = line.substring('commit '.length).trim();
          info.hash = hash;
        } else if (line.startsWith('Author: ')) {
          const author = line.substring('Author: '.length).trim();
          info.author = author;
        } else if (line.startsWith('Date: ')) {
          const date = line.substring('Date: '.length).trim();
          info.date = date;
        } else if (line.startsWith('Merge: ')) {
          const merge = line.substring('Merge: '.length).trim();
          info.merge = merge;
        } else if (line.startsWith('    ')) {
          const message = line.substring(line.indexOf(':') + 1).trim();
          info.message = message;
        }
      });

      this._endCommand(id, startTime);

      return {
        stashRef,
        stashIndex,
        info,
        showOutput,
        files,
        fileDiffs,
        totalFiles: files.length
      };
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error getting stash info for ${stashRef}:`, error);
      return {};
    }
  }

  async getStashFileDiff(stashIndex, filePath) {
    try {
      const stashRef = `stash@{${stashIndex}}`;
      const startTime = performance.now();
      const id = this._startCommand(`git diff "${stashRef}" -- "${filePath}"`, startTime);
      const diff = await this.git.raw([
        'diff',
        stashRef,
        '--',
        filePath
      ]);
      this._endCommand(id, startTime);
      return diff;
    } catch (error) {
      return `Error getting diff: ${error.message}.`;
    }
  }

  async discard(filePaths) {
    const startTime = performance.now();

    const id = this._startCommand(`git checkout -- ${filePaths.join(' ')}`, startTime);

    // Get the current status to identify new vs modified files
    const statusResult = await this.git.status();
    this._logCommand('git status', startTime);

    for (const filePath of filePaths) {
      const fileStatus = statusResult.files.find(f => f.path === filePath);
      const isStaged = fileStatus?.index !== ' ';

      if (fileStatus?.working_dir === '?' || (fileStatus?.index === 'A' && !isStaged)) {
        // New untracked file or new staged file - delete it from filesystem
        const fullPath = path.join(this.repoPath, filePath);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted new file: ${filePath}`);
          }
        } catch (error) {
          console.error(`Failed to delete file ${filePath}:`, error);
        }
      } else {
        // Existing file - restore it from git
        if (isStaged) {
          // If staged, first unstage it
          await this.git.reset(['HEAD', '--', filePath]);
          this._logCommand(`git reset HEAD -- ${filePath}`, startTime);
        }
        // Then restore the file
        await this.git.checkout(['--', filePath]);
        this._logCommand(`git checkout -- ${filePath}`, startTime);
      }
    }
    this._endCommand(id, startTime);
  }

  async checkoutBranch(branchName) {
    const startTime = performance.now();
    const id = this._startCommand(`git checkout ${branchName}`, startTime);
    await this.git.checkout(branchName);
    this._endCommand(id, startTime);
  }

  async log(branchName, maxCount = 100) {
    const startTime = performance.now();
    const id = this._startCommand(`git log ${branchName} --max-count=${maxCount}`, startTime);

    const result = await this.git.log({
      [branchName]: null,
      maxCount: maxCount,
      format: {
        hash: '%H',
        date: '%ai',
        message: '%s',
        body: '%b',
        author_name: '%an',
        author_email: '%ae'
      }
    });

    // Check which commits exist on origin
    const commitsWithRemoteStatus = await Promise.all(
      result.all.map(async (commit) => {
        try {
          // Check if commit exists on origin branch
          const unpushedCommits = await this.git.raw(['log', `origin/${branchName}..${commit.hash}`]);
          const onOrigin = unpushedCommits.trim().length === 0;
          return { ...commit, onOrigin };
        } catch (error) {
          // If merge-base fails, commit doesn't exist on origin
          return { ...commit, onOrigin: false };
        }
      })
    );

    this._endCommand(id, startTime);
    return commitsWithRemoteStatus;
  }

  async getCommitFiles(commitHash) {
    const startTime = performance.now();
    const id = this._startCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

    try {
      const result = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash]);
      this._logCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

      if (!result.trim()) {
        this._endCommand(id, startTime);
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

      this._endCommand(id, startTime);
      return files;
    } catch (error) {
      this._endCommand(id, startTime);
      return [];
    }
  }

  async createPatch(filePaths, outputPath, isStaged = false) {
    const startTime = performance.now();
    const id = this._startCommand(`git createPatch`, startTime);

    let patchContent;

    if (isStaged) {
      patchContent = await this.git.diff(['--cached', '--', ...filePaths]);
      this._logCommand(`git diff --cached -- ${filePaths.length} files > ${outputPath}`, startTime);
    } else {
      patchContent = await this.git.diff(['--', ...filePaths]);
      this._logCommand(`git diff -- ${filePaths.length} files > ${outputPath}`, startTime);
    }

    fs.writeFileSync(outputPath, patchContent, 'utf8');
    this._endCommand(id, startTime);
  }

  async show(commitHash, filePath) {
    const startTime = performance.now();
    const id = this._startCommand(`git show --format= --unified=3 ${commitHash} -- ${filePath}`, startTime);
    try {
      // Use git show with specific format to get the diff for this file
      // This should produce the same format as git diff
      const result = await this.git.raw(['show', '--format=', '--unified=3', `${commitHash}`, '--', filePath]);
      this._endCommand(id, startTime);
      return result;
    } catch (error) {
      this._endCommand(id, startTime);
      //console.error(`Error loading diff for ${filePath} in commit ${commitHash}:`, error);
      return `Error loading diff for ${filePath} in commit ${commitHash}: ${error.message}`;
    }
  }

  async clone(repoUrl, parentFolder, repoName) {
    const startTime = performance.now();
    const id = this._startCommand(`git clone ${repoUrl} ${parentFolder}/${repoName}`, startTime);
    // Clone into the specific folder within parent directory
    const localFolder = parentFolder + "/" + repoName;
    const git = simpleGit();
    try {
      await git.clone(repoUrl, localFolder);
    } catch (error) {
    }
    this._endCommand(id, startTime);
  }

  async raw(args) {
    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    let result = null;
    try {
      result = await this.git.raw(args);
    } catch (error) {
    }
    this._endCommand(id, startTime);
    return result;
  }
}

module.exports = SimpleGitAdapter;
