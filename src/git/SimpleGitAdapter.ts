import simpleGit, { SimpleGit } from 'simple-git';
import GitAdapter, {
  Commit,
  CommandStateCallback,
  GitStatus,
  BranchInfo,
  StashInfo,
  StashListResponse,
  CommitFile } from './GitAdapter';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Git adapter implementation using simple-git library
 */
export class SimpleGitAdapter extends GitAdapter {
  private git: SimpleGit | null = null;

  constructor(repoPath: string, commandStateCallback: CommandStateCallback | null = null) {
    super(repoPath, commandStateCallback);
  }

  async open(): Promise<void> {
    this.git = simpleGit({ baseDir: this.repoPath });
    this.isOpen = true;
  }

  async init(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git init', startTime);
    try {
      const git = simpleGit({ baseDir: this.repoPath });
      await git.init();
    } catch (error) {
      console.error('Error initializing repository:', error);
    }
    this._endCommand(id, startTime);
  }

  async status(path?: string, noLock?: boolean, skipNotification?: boolean): Promise<GitStatus> {  
    const startTime = performance.now();
    const id = skipNotification ? -1 : this._startCommand('git status', startTime);
    let result: any = null;
    try {
      if (path) {
        if (noLock) {
          const git2 = simpleGit({ baseDir: this.repoPath }).env({'GIT_OPTIONAL_LOCKS': '0'});
          result = await git2.raw(['status', '--', path]);
        } else {
          result = await this.git!.raw(['status', '--', path]);
        }
      } else {
        if (noLock) {
          const git2 = simpleGit({ baseDir: this.repoPath }).env({'GIT_OPTIONAL_LOCKS': '0'});
          result = await git2.status();
        } else {
          result = await this.git.status();
        }
      }
    } catch (error) {
      console.error('Error getting status:', error);
    }
    if (!skipNotification) {
      this._endCommand(id, startTime);
    }
    this.currentBranch = result?.current || null; // Track current branch
    return {
      notAdded: result?.not_added || [],
      conflicted: result?.conflicted || [],
      created: result?.created || [],
      deleted: result?.deleted || [],
      ignored: result?.ignored || [],
      modified: result?.modified || [],
      renamed: result?.renamed || [],
      staged: result?.staged || [],
      ahead: result?.ahead || 0,
      behind: result?.behind || 0,
      current: result?.current || '',
      tracking: result?.tracking || '',
      detached: result?.detached || false,
      files: result?.files || []
    };
  }

  async branchLocal(): Promise<BranchInfo> {
    const startTime = performance.now();
    const id = this._startCommand('git branch --list', startTime);
    let result: BranchInfo | null = null;
    try {
      result = await this.git.branchLocal();
    } catch (error) {
      console.error('Error getting local branches:', error);
    }
    this._endCommand(id, startTime);
    return result || { all: [] };
  }

  async createBranch(branchName: string, startPoint: string | null = null): Promise<void> {   
    const startTime = performance.now();
    let id: number;
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
      this._endCommand(id!, startTime);
      console.error(`Error creating branch ${branchName}:`, error);
      throw error;
    }
  }

  async getAheadBehind(localBranch: string, remoteBranch: string): Promise<{ ahead: number; behind: number }> {
    const startTime = performance.now();
    let id: number;
    try {
      id = this._startCommand(`git rev-list --left-right --count ${localBranch}...${remoteBranch}`, startTime);
      const result = await this.git.raw(['rev-list', '--left-right', '--count', `${localBranch}...${remoteBranch}`]);
      this._endCommand(id, startTime);
      const [ahead, behind] = result.trim().split('\t').map(Number);
      return { ahead, behind };
    } catch (error) {
      this._endCommand(id!, startTime);
      return { ahead: -1, behind: -1 };
    }
  }

  async getOriginUrl(): Promise<string> {
    const startTime = performance.now();
    let id: number;
    try {
      id = this._startCommand('git remote get-url origin', startTime);
      const result = await this.git.raw(['remote', 'get-url', 'origin']);
      this._endCommand(id, startTime);
      return result.trim();
    } catch (error) {
      this._endCommand(id!, startTime);
      return '';
    }
  }

  async setRemoteUrl(remoteName: string, url: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git remote set-url ${remoteName} ${url}`, startTime);
    try {
      await this.git.raw(['remote', 'set-url', remoteName, url]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error setting remote URL for ${remoteName}:`, error);
      throw error;
    }
  }

  async addRemote(remoteName: string, url: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git remote add ${remoteName} ${url}`, startTime);
    try {
      await this.git.raw(['remote', 'add', remoteName, url]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error adding remote ${remoteName}:`, error);
      throw error;
    }
  }

  async removeRemote(remoteName: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git remote remove ${remoteName}`, startTime);
    try {
      await this.git.raw(['remote', 'remove', remoteName]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error removing remote ${remoteName}:`, error);
      throw error;
    }
  }

  async editRemote(remoteName: string, newUrl: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git remote set-url ${remoteName} ${newUrl}`, startTime);
    try {
      await this.git.raw(['remote', 'set-url', remoteName, newUrl]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error editing remote ${remoteName}:`, error);
      throw error;
    }
  }

  async resetToOrigin(branch: string): Promise<void> {
    const startTime = performance.now();
    let idFetch: number;
    let idReset: number;
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
      this._endCommand(idFetch!, startTime);
      this._endCommand(idReset!, startTime);
      console.error(`Error resetting to origin/${branch}:`, error);
      throw error;
    }
  }

  async stashList(): Promise<StashListResponse> {
    const startTime = performance.now();
    const id = this._startCommand('git stash list', startTime);
    let result: any = null;
    try {
      result = await this.git.stashList();
    } catch (error) {
      console.error('Error getting stash list:', error);
    }
    this._endCommand(id, startTime);
    
    // Convert simple-git stash list format to our interface
    const stashItems = result?.all || [];
    return {
      all: stashItems.map((item: any) => ({
        hash: item.hash || '',
        message: item.message || ''
      }))
    };
  }

  async fetch(remote: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git fetch ${remote}`, startTime);
    try {
      await this.git.fetch(remote);
    } catch (error) {
      console.error(`Error fetching from ${remote}:`, error);
    }
    this._endCommand(id, startTime);
  }

  async pull(remote: string, branch: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git pull ${remote} ${branch}`, startTime);
    try {
      await this.git.pull(remote, branch);
    } catch (error) {
      console.error(`Error pulling from ${remote}/${branch}:`, error);
    }
    this._endCommand(id, startTime);
  }

  async push(remote: string, refspec: string, options: string[] = []): Promise<string> {
    const startTime = performance.now();
    let result = '';

    const args = ['push', remote, refspec];
    if (options.length > 0) {
      args.push(...options);
    }

    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      // Use exec to capture both stdout and stderr
      // Git push messages (including PR URLs) typically go to stderr
      const command = `git ${args.map(arg => {
        // Quote arguments that contain special characters
        if (arg.includes(' ') || arg.includes('&') || arg.includes('|')) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      }).join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.repoPath,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      // Combine stdout and stderr as PR URLs typically appear in stderr
      result = stdout + '\n' + stderr;
    } catch (error: any) {
      console.error(`Error pushing to ${remote} ${refspec}:`, error);

      // Capture stdout and stderr from error (exec includes these even on failure)
      result = (error.stdout || '') + '\n' + (error.stderr || '');

      throw error;
    } finally {
      this._endCommand(id, startTime);
    }

    return result;
  }

  async stashPush(message: string, filePaths: string[] | null = null): Promise<void> {
    const startTime = performance.now();
    if (filePaths && filePaths.length > 0) {
      const id = this._startCommand(`git stash push -m "${message}" -- ${filePaths.length} files`, startTime);
      try {
        await this.git.stash(['push', '-m', message, '--', ...filePaths]);
      } catch (error) {
        console.error(`Error pushing stash with message "${message}" for ${filePaths.length} files:`, error);
      }
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git stash push -m "${message}"`, startTime);
      try {
        await this.git.stash(['push', '-m', message]);
      } catch (error) {
        console.error(`Error pushing stash with message "${message}":`, error);
      }
      this._endCommand(id, startTime);
    }
  }

  async stashPop(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git stash pop', startTime);
    try {
      await this.git.stash(['pop']);
    } catch (error) {
      console.error('Error popping stash:', error);
    }
    this._endCommand(id, startTime);
  }

  async stashApply(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git stash apply', startTime);
    try {
      await this.git.stash(['apply']);
    } catch (error) {
      console.error('Error applying stash:', error);
    }
    this._endCommand(id, startTime);
  }

  async add(filePaths: string | string[]): Promise<void> {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const id = this._startCommand(`git add ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
    try {
      await this.git.add(paths);
    } catch (error) {
      console.error('Error staging files:', error);
      throw error;
    }
    this._endCommand(id, startTime);
  }

  async reset(filePaths: string | string[]): Promise<void> {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const id = this._startCommand(`git reset HEAD ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
    try {
      await this.git.reset(['HEAD', ...paths]);
    } catch (error) {
      console.error('Error unstaging files:', error);
    }
    this._endCommand(id, startTime);
  }

  async commit(message: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git commit -m "${message}"`, startTime);
    try {
      await this.git.commit(message);
    } catch (error) {
      console.error('Error committing changes:', error);
    }
    this._endCommand(id, startTime);
  }

  async diff(filePath: string, isStaged: boolean): Promise<string> {  
    const startTime = performance.now();
    let result: string;
    if (isStaged) {
      const id = this._startCommand(`git diff --cached --ignore-space-at-eol -- ${filePath}`, startTime);
      try {
        result = await this.git.diff(['--cached', '--ignore-space-at-eol', '--', filePath]);
      } catch (error: any) {
        console.log("Error getting staged diff for", filePath, error);
        result = `Error getting staged diff for ${filePath}: ${error.message}`;
      }
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git diff --ignore-space-at-eol -- ${filePath}`, startTime);
      try {
        result = await this.git.diff(['--ignore-space-at-eol', '--', filePath]);
      } catch (error: any) {
        console.log("Error getting diff for", filePath, error);
        result = `Error getting diff for ${filePath}: ${error.message}`;
      }
      this._endCommand(id, startTime);
    }
    return result;
  }

  /**
   * Get detailed information about a git stash entry
   * @param stashIndex - The stash index (default: 0 for most recent)
   * @param repoPath - Path to the git repository (default: current directory)
   * @returns Object containing stash information
   */
  async getStashInfo(stashIndex: number): Promise<StashInfo> {   
    const stashRef = `stash@{${stashIndex}}`;
    const startTime = performance.now();
    const id = this._startCommand(`git show ${stashRef}`, startTime);
    try {
      // Get basic stash info using git show
      const showOutput = await this.git.show([stashRef]);

      // Get list of files in stash
      const stashShowOutput = await this.git.raw([
        'stash',
        'show',
        '--name-only',
        stashRef
      ]);

      const files = stashShowOutput
        .trim()
        .split('\n')
        .filter((file: string) => file.length > 0);

      // Get diff for each file
      const fileDiffs: Map<string, string> = new Map();

      const info: StashInfo = {
        stashRef,
        index: stashIndex,
        output: showOutput,
        files,
        fileDiffs,
        totalFiles: files.length,
        hash: '',
        author: '',
        date: '',
        merge: '',
        message: ''
      };

      showOutput.split('\n').forEach((line: string) => {
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

      return info;
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error getting stash info for ${stashRef}:`, error);
      const info: StashInfo = {
        stashRef,
        index: stashIndex,
        output: '',
        files: [],
        fileDiffs: new Map<string, string>(),
        totalFiles: 0,
        hash: '',
        author: '',
        date: '',
        merge: '',
        message: ''
      }
      return info;
    }
  }

  async getStashFileDiff(stashIndex: number, filePath: string): Promise<string> {   
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
    } catch (error: any) {
      return `Error getting diff: ${error.message}.`;
    }
  }

  async discard(filePaths: string[]): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git discard ${filePaths.length} files`, startTime);

    // Get current status to identify new vs modified files
    const statusResult = await this.git.status();
    this._logCommand('git status', startTime);

    const newFiles: string[] = [];
    const stagedFiles: string[] = [];
    const modifiedFiles: string[] = [];

    // Categorize files
    for (const filePath of filePaths) {
      const fileStatus = statusResult.files.find(f => f.path === filePath);
      const isStaged = fileStatus?.index !== ' ';

      if (fileStatus?.working_dir === '?' || (fileStatus?.index === 'A' && !isStaged)) {
        // New untracked file or new staged file - delete it from filesystem
        newFiles.push(filePath);
      } else if (isStaged) {
        // Staged file - needs unstaging first
        stagedFiles.push(filePath);
      } else {
        // Modified file - just needs checkout
        modifiedFiles.push(filePath);
      }
    }

    // Helper to batch files based on command line length
    // Windows safe limit is ~6000 characters to leave room for command and repo path
    const batchFilesByLength = (files: string[], maxLength: number = 6000): string[][] => {
      const batches: string[][] = [];
      let currentBatch: string[] = [];
      let currentLength = 0;

      for (const file of files) {
        // Add quotes and space: "file" + space = file.length + 3
        const fileLength = file.length + 3;

        if (currentLength + fileLength > maxLength && currentBatch.length > 0) {
          // Start new batch
          batches.push(currentBatch);
          currentBatch = [file];
          currentLength = fileLength;
        } else {
          currentBatch.push(file);
          currentLength += fileLength;
        }
      }

      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      return batches;
    };

    // Process new files (delete from filesystem)
    for (const filePath of newFiles) {
      const fullPath = path.join(this.repoPath, filePath);
      try {
        if (fsSync.existsSync(fullPath)) {
          fsSync.unlinkSync(fullPath);
          console.log(`Deleted new file: ${filePath}`);
        }
      } catch (error) {
        console.error(`Failed to delete file ${filePath}:`, error);
      }
    }

    // Process staged files in batches (unstage then checkout)
    if (stagedFiles.length > 0) {
      const stagedBatches = batchFilesByLength(stagedFiles);
      console.log(`Unstaging ${stagedFiles.length} files in ${stagedBatches.length} batch(es)`);

      for (const batch of stagedBatches) {
        await this.git.reset(['HEAD', '--', ...batch]);
        this._logCommand(`git reset HEAD -- ${batch.length} files`, startTime);
      }

      // After unstaging, checkout all staged files in batches
      const checkoutBatches = batchFilesByLength(stagedFiles);
      for (const batch of checkoutBatches) {
        await this.git.checkout(['--', ...batch]);
        this._logCommand(`git checkout -- ${batch.length} files`, startTime);
      }
    }

    // Process modified files in batches (checkout only)
    if (modifiedFiles.length > 0) {
      const modifiedBatches = batchFilesByLength(modifiedFiles);
      console.log(`Restoring ${modifiedFiles.length} files in ${modifiedBatches.length} batch(es)`);

      for (const batch of modifiedBatches) {
        await this.git.checkout(['--', ...batch]);
        this._logCommand(`git checkout -- ${batch.length} files`, startTime);
      }
    }

    this._endCommand(id, startTime);
  }

  async checkoutBranch(branchName: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git checkout ${branchName}`, startTime);
    await this.git.checkout(branchName);
    this._endCommand(id, startTime);
  }

  async log(branchName: string, maxCount: number = 100): Promise<Commit[]> {
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

    const commits = result.all.map((commit: any) => ({
      hash: commit.hash,
      author_name: commit.author_name,
      author_email: commit.author_email,
      date: commit.date,
      message: commit.message,
      body: commit.body,
      onOrigin: branchName.startsWith('origin/')
    }));

    Promise.all(commits .map(async (commit) => {
      try {
        // Check if commit exists on origin branch
        // For remote branches, we need to check against the actual remote branch name
        // If we're loading a remote branch like "origin/feature/login", we should compare against that branch
        const isRemoteBranch = branchName.startsWith('origin/');
        if (!isRemoteBranch) {
          const refToCheck = isRemoteBranch ? branchName : `origin/${branchName}`;
          const unpushedCommits = await this.git.raw(['log', `${refToCheck}..${commit.hash}`]);
          const onOrigin = unpushedCommits.trim().length === 0;
          commit.onOrigin = onOrigin;
        }
      } catch (error) {
      }
    }));

    this._endCommand(id, startTime);

    return commits;
  }

  async getCommitFiles(commitHash: string): Promise<Array<CommitFile>> {
    const startTime = performance.now();
    const id = this._startCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

    try {
      const result = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash]);
      this._logCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

      if (!result.trim()) {
        this._endCommand(id, startTime);
        return [];
      }

      const files = result.trim().split('\n').map((line: string) => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const status = parts[0];
          const path = parts[1];
          return { status, path };
        }
        return null;
      }).filter((item): item is { status: string; path: string } => item !== null);

      this._endCommand(id, startTime);
      return files;
    } catch (error) {
      this._endCommand(id, startTime);
      return [];
    }
  }

  async createPatch(filePaths: string[], outputPath: string, isStaged: boolean = false): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git createPatch`, startTime);

    let patchContent: string;

    if (isStaged) {
      patchContent = await this.git.diff(['--cached', '--', ...filePaths]);
      this._logCommand(`git diff --cached -- ${filePaths.length} files > ${outputPath}`, startTime);
    } else {
      patchContent = await this.git.diff(['--', ...filePaths]);
      this._logCommand(`git diff -- ${filePaths.length} files > ${outputPath}`, startTime);
    }

    fsSync.writeFileSync(outputPath, patchContent, 'utf8');
    this._endCommand(id, startTime);
  }

  async show(commitHash: string, filePath: string): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand(`git show --format= --unified=3 ${commitHash} -- ${filePath}`, startTime);
    try {
      // Use git show with specific format to get diff for this file
      // This should produce same format as git diff
      const result = await this.git.raw(['show', '--format=', '--unified=3', `${commitHash}`, '--', filePath]);
      this._endCommand(id, startTime);
      return result;
    } catch (error: any) {
      this._endCommand(id, startTime);
      return `Error loading diff for ${filePath} in commit ${commitHash}: ${error.message}`;
    }
  }

  async clone(repoUrl: string, parentFolder: string, repoName: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git clone ${repoUrl} ${parentFolder}/${repoName}`, startTime);
    // Clone into specific folder within parent directory
    const localFolder = parentFolder + "/" + repoName;
    const git = simpleGit();
    try {
      await git.clone(repoUrl, localFolder);
    } catch (error) {
      console.error(`Error cloning repository from ${repoUrl} to ${localFolder}:`, error);
    }
    this._endCommand(id, startTime);
  }

  async raw(args: string[]): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    let result: string | null = null;
    try {
      result = await this.git.raw(args);
    } catch (error) {
      console.error(`Error executing git ${args.join(' ')}:`, error);
    }
    this._endCommand(id, startTime);
    return result || '';
  }

  async isLfsInitialized(): Promise<boolean> {
    try {
      // Check if git-lfs is installed by running git lfs version
      await this.git.raw(['lfs', 'version']);

      // Check if LFS is initialized in this repo by checking for .gitattributes
      const result = await this.git.raw(['lfs', 'ls-files']);
      // If we get here without error, LFS is initialized
      return true;
    } catch (error) {
      // If command fails, LFS is not initialized or not installed
      return false;
    }
  }

  async lfsInstall(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs install', startTime);
    try {
      await this.git.raw(['lfs', 'install']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to initialize Git LFS: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsTrack(pattern: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git lfs track "${pattern}"`, startTime);
    try {
      await this.git.raw(['lfs', 'track', pattern]);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to track pattern: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsStatus(): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs status', startTime);
    try {
      const result = await this.git.raw(['lfs', 'status']);
      this._endCommand(id, startTime);
      return result;
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to get LFS status: ${error.message}`);
    }
  }

  async lfsFetch(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs fetch', startTime);
    try {
      await this.git.raw(['lfs', 'fetch']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to fetch LFS objects: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsPull(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs pull', startTime);
    try {
      await this.git.raw(['lfs', 'pull']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to pull LFS objects: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsPrune(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs prune', startTime);
    try {
      await this.git.raw(['lfs', 'prune']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to prune LFS objects: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsUninstall(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs uninstall', startTime);
    try {
      await this.git.raw(['lfs', 'uninstall']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to uninstall Git LFS: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async addToGitignore(pattern: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('add to .gitignore', startTime);
    try {
      const gitignorePath = path.join(this.repoPath, '.gitignore');
      let content = '';
      
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch (error) {
        // .gitignore doesn't exist, that's fine
      }
      
      // Check if pattern already exists
      const lines = content.split('\n');
      if (lines.includes(pattern)) {
        this._endCommand(id, startTime);
        return;
      }
      
      // Add pattern to file
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += pattern + '\n';
      
      await fs.writeFile(gitignorePath, content, 'utf8');
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to add to .gitignore: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async isIgnored(filePath: string): Promise<boolean> {
    const startTime = performance.now();
    const id = this._startCommand('check-ignore', startTime);
    try {
      await this.git.raw(['check-ignore', filePath]);
      this._endCommand(id, startTime);
      return true;
    } catch (error) {
      this._endCommand(id, startTime);
      return false;
    }
  }

  async getGitignoreContents(): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand('read .gitignore', startTime);
    try {
      const gitignorePath = path.join(this.repoPath, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf8');
      this._endCommand(id, startTime);
      return content;
    } catch (error: any) {
      this._endCommand(id, startTime);
      return '';
    }
  }
}

export default SimpleGitAdapter;