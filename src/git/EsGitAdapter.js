const GitAdapter = require('./GitAdapter');
import { openRepository } from 'es-git';

/**
 * Git adapter implementation using es-git library
 */
class EsGitAdapter extends GitAdapter {
  constructor(repoPath) {
    super(repoPath);
    this.git = null;
  }

  async open() {
    await super.open();
    this.git = await openRepository(this.repoPath);
  }

  async status() {
  }

  async branchLocal() {
    //return await this.git.branches();
  }

  async getAheadBehind(localBranch, remoteBranch) {
  }

  async stashList() {
  }

  async fetch(remote) {
  }

  async pull(remote, branch) {
  }

  async push(remote, refspec, options = []) {
  }

  async stashPush(message) {
  }

  async stashPop() {
  }

  async add(filePath) {
  }

  async reset(filePath) {
  }

  async commit(message) {
  }

  async diff(filePath, isStaged) {
  }

  async showStash(stashIndex) {
  }

  async raw(args) {
  }
}

module.exports = EsGitAdapter;
