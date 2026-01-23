const simpleGit = require('simple-git');
const GitAdapter = require('./GitAdapter');

/**
 * Git adapter implementation using simple-git library
 */
class SimpleGitAdapter extends GitAdapter {
  constructor(repoPath) {
    super(repoPath);
    this.git = null;
  }

  async open() {
    await super.open();
    this.git = simpleGit(this.repoPath);
  }

  async status() {
    const startTime = performance.now();
    const result = await this.git.status();
    this._logCommand('git status', startTime);
    return result;
  }

  async branchLocal() {
    const startTime = performance.now();
    const result = await this.git.branchLocal();
    this._logCommand('git branch --list', startTime);
    return result;
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

  async add(filePath) {
    const startTime = performance.now();
    await this.git.add(filePath);
    this._logCommand(`git add ${filePath}`, startTime);
  }

  async addMultiple(filePaths) {
    const startTime = performance.now();
    await this.git.add(filePaths);
    this._logCommand(`git add ${filePaths.length} files`, startTime);
  }

  async reset(filePath) {
    const startTime = performance.now();
    await this.git.reset(['HEAD', filePath]);
    this._logCommand(`git reset HEAD ${filePath}`, startTime);
  }

  async resetMultiple(filePaths) {
    const startTime = performance.now();
    await this.git.reset(['HEAD', ...filePaths]);
    this._logCommand(`git reset HEAD ${filePaths.length} files`, startTime);
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
      result = await this.git.diff(['--cached', '--', filePath]);
      this._logCommand(`git diff --cached -- ${filePath}`, startTime);
    } else {
      result = await this.git.diff(['--', filePath]);
      this._logCommand(`git diff -- ${filePath}`, startTime);
    }
    return result;
  }

  async showStash(stashIndex) {
    const startTime = performance.now();
    const result = await this.git.show([`stash@{${stashIndex}}`]);
    this._logCommand(`git show stash@{${stashIndex}}`, startTime);
    return result;
  }

  async discard(filePaths) {
    const startTime = performance.now();
    await this.git.checkout(['--', ...filePaths]);
    this._logCommand(`git checkout -- ${filePaths.length} files`, startTime);
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
    this._logCommand(`git log ${branchName} --max-count=${maxCount}`, startTime);
    return result.all;
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

  async raw(args) {
    const startTime = performance.now();
    const result = await this.git.raw(args);
    this._logCommand(`git ${args.join(' ')}`, startTime);
    return result;
  }
}

module.exports = SimpleGitAdapter;
