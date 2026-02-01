// Common types for React components

export interface SelectedItem {
  type: string;
  [key: string]: any;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface RunningCommand {
  id: number;
  command: string;
  time: number;
}

export interface FileDiff {
  path: string;
  status: string;
  diff: string;
}

export interface LocalFileStatus {
  file: string;
  status: 'staged' | 'unstaged';
}

export interface BranchStatus {
  [branchName: string]: {
    ahead: number;
    behind: number;
  };
}

export interface FileStatus {
  path: string;
  status: 'modified' | 'created' | 'deleted' | 'renamed' | 'conflict';
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  remote?: string;
  ahead?: number;
  behind?: number;
}



export interface DialogProps {
  onClose: () => void;
}

export interface GitRepository {
  path: string;
  name?: string;
  currentBranch?: string;
  originUrl?: string;
}
