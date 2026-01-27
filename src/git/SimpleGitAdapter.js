const simpleGit = require('simple-git');
const GitAdapter = require('./GitAdapter');

/**
 * Git adapter implementation using simple-git library
 */
class SimpleGitAdapter extends GitAdapter {
  constructor(repoPath) {
    super(repoPath);
    this.git = null;
    this.currentBranch = null;
  }

  async open() {
    await super.open();
    this.git = simpleGit(this.repoPath);
  }

  async status() {
    const startTime = performance.now();
    const result = await this.git.status();
    this.currentBranch = result.current; // Track current branch
    //this._logCommand('git status', startTime);
    return result;
  }

  async branchLocal() {
    const startTime = performance.now();
    const result = await this.git.branchLocal();
    this._logCommand('git branch --list', startTime);
    return result;
  }

  async createBranch(branchName, startPoint = null) {
    const startTime = performance.now();
    try {
      if (startPoint) {
        await this.git.branch([branchName, startPoint]);
        this._logCommand(`git branch ${branchName} ${startPoint}`, startTime);
      } else {
        await this.git.branch([branchName]);
        this._logCommand(`git branch ${branchName}`, startTime);
      }
    } catch (error) {
      const command = startPoint ? `git branch ${branchName} ${startPoint}` : `git branch ${branchName}`;
      this._logCommand(command, startTime);
      throw error;
    }
  }

  async getAheadBehind(localBranch, remoteBranch) {
    const startTime = performance.now();
    try {
      const result = await this.git.raw(['rev-list', '--left-right', '--count', `${localBranch}...${remoteBranch}`]);
      this._logCommand(`git rev-list --left-right --count ${localBranch}...${remoteBranch}`, startTime);
      const [ahead, behind] = result.trim().split('\t').map(Number);
      return { ahead, behind };
    } catch (error) {
      this._logCommand(`git rev-list --left-right --count ${localBranch}...${remoteBranch}`, startTime);
      throw error;
    }
  }

  async getOriginUrl() {
    const startTime = performance.now();
    try {
      const result = await this.git.raw(['remote', 'get-url', 'origin']);
      //this._logCommand('git remote get-url origin', startTime);
      return result.trim();
    } catch (error) {
      this._logCommand('git remote get-url origin', startTime);
      return '';
    }
  }

  async resetToOrigin(branch) {
    const startTime = performance.now();
    try {
      // Fetch latest from origin
      await this.git.fetch('origin');
      this._logCommand('git fetch origin', startTime);
      
      // Hard reset to origin/branch
      await this.git.raw(['reset', '--hard', `origin/${branch}`]);
      this._logCommand(`git reset --hard origin/${branch}`, startTime);
    } catch (error) {
      this._logCommand(`git reset --hard origin/${branch}`, startTime);
      throw error;
    }
  }

  async stashList() {
    const startTime = performance.now();
    const result = await this.git.stashList();
    this._logCommand('git stash list', startTime);
    return result;
  }

  async fetch(remote) {
    const startTime = performance.now();
    await this.git.fetch(remote);
    this._logCommand(`git fetch ${remote}`, startTime);
  }

  async pull(remote, branch) {
    const startTime = performance.now();
    await this.git.pull(remote, branch);
    this._logCommand(`git pull ${remote} ${branch}`, startTime);
  }

  async push(remote, refspec, options = []) {
    const startTime = performance.now();
    if (options.length > 0) {
      await this.git.push(remote, refspec, options);
      this._logCommand(`git push ${remote} ${refspec} ${options.join(' ')}`, startTime);
    } else {
      await this.git.push(remote, refspec);
      this._logCommand(`git push ${remote} ${refspec}`, startTime);
    }
  }

  async stashPush(message, filePaths = null) {
    const startTime = performance.now();
    if (filePaths && filePaths.length > 0) {
      await this.git.stash(['push', '-m', message, '--', ...filePaths]);
      this._logCommand(`git stash push -m "${message}" -- ${filePaths.length} files`, startTime);
    } else {
      await this.git.stash(['push', '-m', message]);
      this._logCommand(`git stash push -m "${message}"`, startTime);
    }
  }

  async stashPop() {
    const startTime = performance.now();
    await this.git.stash(['pop']);
    this._logCommand('git stash pop', startTime);
  }

  async stashApply() {
    const startTime = performance.now();
    await this.git.stash(['apply']);
    this._logCommand('git stash apply', startTime);
  }

  async add(filePaths) {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    await this.git.add(paths);
    this._logCommand(`git add ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
  }

  async reset(filePaths) {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    await this.git.reset(['HEAD', ...paths]);
    this._logCommand(`git reset HEAD ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
  }

  async commit(message) {
    const startTime = performance.now();
    await this.git.commit(message);
    this._logCommand(`git commit -m "${message}"`, startTime);
  }

  async diff(filePath, isStaged) {
    const startTime = performance.now();
    let result;
    if (isStaged) {
      result = await this.git.diff(['--cached', '--ignore-space-at-eol', '--', filePath]);
      this._logCommand(`git diff --cached --ignore-space-at-eol -- ${filePath}`, startTime);
    } else {
      result = await this.git.diff(['--ignore-space-at-eol', '--', filePath]);
      this._logCommand(`git diff --ignore-space-at-eol -- ${filePath}`, startTime);
    }
    console.log(result);
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
      this._logCommand(`git show --name-only ${stashRef}`, startTime);
      
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
      throw new Error(`Failed to get stash info: ${error.message}`);
    }
  }

  async getStashFileDiff(stashIndex, filePath) {
    try {
      const stashRef = `stash@{${stashIndex}}`;
      const startTime = performance.now();
      this._logCommand(`git diff "${stashRef}" -- "${filePath}"`, startTime);
      const diff = await this.git.raw([
        'diff',
        stashRef,
        '--',
        filePath
      ]);
      return diff;
    } catch (error) {
      return `Error getting diff: ${error.message}.`;
    }
  }

  async discard(filePaths) {
    const startTime = performance.now();
    const fs = require('fs');
    const path = require('path');

    // Get the current status to identify new vs modified files
    const statusResult = await this.status();
    
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
  }

  async checkoutBranch(branchName) {
    const startTime = performance.now();
    await this.git.checkout(branchName);
    this._logCommand(`git checkout ${branchName}`, startTime);
  }

  async log(branchName, maxCount = 100) {
    const startTime = performance.now();
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
    
    this._logCommand(`git log ${branchName} --max-count=${maxCount}`, startTime);
    return commitsWithRemoteStatus;
  }

  async getCommitFiles(commitHash) {
    const startTime = performance.now();
    try {
      const result = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash]);
      this._logCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

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
      this._logCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);
      return [];
    }
  }

  async createPatch(filePaths, outputPath, isStaged = false) {
    const startTime = performance.now();
    const fs = require('fs');
    let patchContent;

    if (isStaged) {
      patchContent = await this.git.diff(['--cached', '--', ...filePaths]);
      this._logCommand(`git diff --cached -- ${filePaths.length} files > ${outputPath}`, startTime);
    } else {
      patchContent = await this.git.diff(['--', ...filePaths]);
      this._logCommand(`git diff -- ${filePaths.length} files > ${outputPath}`, startTime);
    }

    fs.writeFileSync(outputPath, patchContent, 'utf8');
  }

  async show(commitHash, filePath) {
    const startTime = performance.now();
    try {
      // Use git show with specific format to get the diff for this file
      // This should produce the same format as git diff
      const result = await this.git.raw(['show', '--format=', '--unified=3', `${commitHash}`, '--', filePath]);
      this._logCommand(`git show --format= --unified=3 ${commitHash} -- ${filePath}`, startTime);
      return result;
    } catch (error) {
      console.error(`Error loading diff for ${filePath} in commit ${commitHash}:`, error);
      return `Error loading diff for ${filePath} in commit ${commitHash}: ${error.message}`;
    }
  }

  async clone(repoUrl, parentFolder, repoName) {
    const startTime = performance.now();
    // Clone into the specific folder within parent directory
    const localFolder = parentFolder + "/" + repoName;
    const git = simpleGit();
    await git.clone(repoUrl, localFolder);
    this._logCommand(`git clone ${repoUrl} ${localFolder}`, startTime);
  }

  async raw(args) {
    const startTime = performance.now();
    const result = await this.git.raw(args);
    this._logCommand(`git ${args.join(' ')}`, startTime);
    return result;
  }
}

module.exports = SimpleGitAdapter;
