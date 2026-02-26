import { useState, useCallback } from 'react';

interface UseRepositoryViewDialogsResult {
  dialogStates: {
    showPullDialog: boolean;
    showPushDialog: string | null;
    showStashDialog: boolean;
    showResetDialog: boolean;
    showCleanWorkingDirectoryDialog: boolean;
    showErrorDialog: boolean;
    showLocalChangesDialog: boolean;
    showCreateBranchDialog: boolean;
    showDeleteBranchDialog: boolean;
    showRenameBranchDialog: boolean;
    showMergeBranchDialog: boolean;
    showRebaseBranchDialog: boolean;
    showApplyStashDialog: boolean;
    showRenameStashDialog: boolean;
    showDeleteStashDialog: boolean;
    showCreateBranchFromCommitDialog: boolean;
    showCreateTagFromCommitDialog: boolean;
    showAmendCommitDialog: boolean;
    showPullRequestDialog: boolean;
  };
  pendingState: {
    pendingBranchSwitch: string | null;
    pullingBranch: string | null;
    newBranchFrom: string | null;
    branchToDelete: string | null;
    branchToRename: string | null;
    mergeSourceBranch: string | null;
    rebaseSourceBranch: string | null;
    stashToApply: { message: string; index: number } | null;
    stashToRename: { message: string; index: number } | null;
    stashToDelete: { message: string; index: number } | null;
    commitForDialog: any;
    pullRequestUrl: string;
    pullRequestBranch: string;
  };
  showPullDialog: () => void;
  hidePullDialog: () => void;
  showPushDialog: (branch: string | null) => void;
  hidePushDialog: () => void;
  showStashDialog: () => void;
  hideStashDialog: () => void;
  showResetDialog: () => void;
  hideResetDialog: () => void;
  showCleanWorkingDirectoryDialog: () => void;
  hideCleanWorkingDirectoryDialog: () => void;
  showErrorDialog: () => void;
  hideErrorDialog: () => void;
  showLocalChangesDialog: (branch: string) => void;
  hideLocalChangesDialog: () => void;
  showCreateBranchDialog: (fromBranch?: string) => void;
  hideCreateBranchDialog: () => void;
  showDeleteBranchDialog: (branch: string) => void;
  hideDeleteBranchDialog: () => void;
  showRenameBranchDialog: (branch: string) => void;
  hideRenameBranchDialog: () => void;
  showMergeBranchDialog: (sourceBranch: string) => void;
  hideMergeBranchDialog: () => void;
  showRebaseBranchDialog: (sourceBranch: string) => void;
  hideRebaseBranchDialog: () => void;
  showApplyStashDialog: (stash: { message: string; index: number }) => void;
  hideApplyStashDialog: () => void;
  showRenameStashDialog: (stash: { message: string; index: number }) => void;
  hideRenameStashDialog: () => void;
  showDeleteStashDialog: (stash: { message: string; index: number }) => void;
  hideDeleteStashDialog: () => void;
  showCreateBranchFromCommitDialog: (commit: any) => void;
  hideCreateBranchFromCommitDialog: () => void;
  showCreateTagFromCommitDialog: (commit: any) => void;
  hideCreateTagFromCommitDialog: () => void;
  showAmendCommitDialog: (commit: any) => void;
  hideAmendCommitDialog: () => void;
  showPullRequestDialog: (url: string, branch: string) => void;
  hidePullRequestDialog: () => void;
}

export function useRepositoryViewDialogs(): UseRepositoryViewDialogsResult {
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState<string | null>(null);
  const [showStashDialog, setShowStashDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showCleanWorkingDirectoryDialog, setShowCleanWorkingDirectoryDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showLocalChangesDialog, setShowLocalChangesDialog] = useState(false);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const [showDeleteBranchDialog, setShowDeleteBranchDialog] = useState(false);
  const [showRenameBranchDialog, setShowRenameBranchDialog] = useState(false);
  const [showMergeBranchDialog, setShowMergeBranchDialog] = useState(false);
  const [showRebaseBranchDialog, setShowRebaseBranchDialog] = useState(false);
  const [showApplyStashDialog, setShowApplyStashDialog] = useState(false);
  const [showRenameStashDialog, setShowRenameStashDialog] = useState(false);
  const [showDeleteStashDialog, setShowDeleteStashDialog] = useState(false);
  const [showCreateBranchFromCommitDialog, setShowCreateBranchFromCommitDialog] = useState(false);
  const [showCreateTagFromCommitDialog, setShowCreateTagFromCommitDialog] = useState(false);
  const [showAmendCommitDialog, setShowAmendCommitDialog] = useState(false);
  const [showPullRequestDialog, setShowPullRequestDialog] = useState(false);

  const [pendingBranchSwitch, setPendingBranchSwitch] = useState<string | null>(null);
  const [pullingBranch, setPullingBranch] = useState<string | null>(null);
  const [newBranchFrom, setNewBranchFrom] = useState<string | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [branchToRename, setBranchToRename] = useState<string | null>(null);
  const [mergeSourceBranch, setMergeSourceBranch] = useState<string | null>(null);
  const [rebaseSourceBranch, setRebaseSourceBranch] = useState<string | null>(null);
  const [stashToApply, setStashToApply] = useState<{ message: string; index: number } | null>(null);
  const [stashToRename, setStashToRename] = useState<{ message: string; index: number } | null>(null);
  const [stashToDelete, setStashToDelete] = useState<{ message: string; index: number } | null>(null);
  const [commitForDialog, setCommitForDialog] = useState<any>(null);
  const [pullRequestUrl, setPullRequestUrl] = useState<string>('');
  const [pullRequestBranch, setPullRequestBranch] = useState<string>('');

  const hidePullDialog = useCallback(() => setShowPullDialog(false), []);
  const hidePushDialog = useCallback(() => setShowPushDialog(null), []);
  const hideStashDialog = useCallback(() => setShowStashDialog(false), []);
  const hideResetDialog = useCallback(() => setShowResetDialog(false), []);
  const hideCleanWorkingDirectoryDialog = useCallback(() => setShowCleanWorkingDirectoryDialog(false), []);
  const hideErrorDialog = useCallback(() => setShowErrorDialog(false), []);
  const hideLocalChangesDialog = useCallback(() => {
    setShowLocalChangesDialog(false);
    setPendingBranchSwitch(null);
  }, []);
  const hideCreateBranchDialog = useCallback(() => {
    setShowCreateBranchDialog(false);
    setNewBranchFrom(null);
  }, []);
  const hideDeleteBranchDialog = useCallback(() => {
    setShowDeleteBranchDialog(false);
    setBranchToDelete(null);
  }, []);
  const hideRenameBranchDialog = useCallback(() => {
    setShowRenameBranchDialog(false);
    setBranchToRename(null);
  }, []);
  const hideMergeBranchDialog = useCallback(() => {
    setShowMergeBranchDialog(false);
    setMergeSourceBranch(null);
  }, []);
  const hideRebaseBranchDialog = useCallback(() => {
    setShowRebaseBranchDialog(false);
    setRebaseSourceBranch(null);
  }, []);
  const hideApplyStashDialog = useCallback(() => {
    setShowApplyStashDialog(false);
    setStashToApply(null);
  }, []);
  const hideRenameStashDialog = useCallback(() => {
    setShowRenameStashDialog(false);
    setStashToRename(null);
  }, []);
  const hideDeleteStashDialog = useCallback(() => {
    setShowDeleteStashDialog(false);
    setStashToDelete(null);
  }, []);
  const hideCreateBranchFromCommitDialog = useCallback(() => {
    setShowCreateBranchFromCommitDialog(false);
    setCommitForDialog(null);
  }, []);
  const hideCreateTagFromCommitDialog = useCallback(() => {
    setShowCreateTagFromCommitDialog(false);
    setCommitForDialog(null);
  }, []);
  const hideAmendCommitDialog = useCallback(() => {
    setShowAmendCommitDialog(false);
    setCommitForDialog(null);
  }, []);
  const hidePullRequestDialog = useCallback(() => setShowPullRequestDialog(false), []);

  return {
    dialogStates: {
      showPullDialog,
      showPushDialog,
      showStashDialog,
      showResetDialog,
      showCleanWorkingDirectoryDialog,
      showErrorDialog,
      showLocalChangesDialog,
      showCreateBranchDialog,
      showDeleteBranchDialog,
      showRenameBranchDialog,
      showMergeBranchDialog,
      showRebaseBranchDialog,
      showApplyStashDialog,
      showRenameStashDialog,
      showDeleteStashDialog,
      showCreateBranchFromCommitDialog,
      showCreateTagFromCommitDialog,
      showAmendCommitDialog,
      showPullRequestDialog,
    },
    pendingState: {
      pendingBranchSwitch,
      pullingBranch,
      newBranchFrom,
      branchToDelete,
      branchToRename,
      mergeSourceBranch,
      rebaseSourceBranch,
      stashToApply,
      stashToRename,
      stashToDelete,
      commitForDialog,
      pullRequestUrl,
      pullRequestBranch,
    },
    showPullDialog: useCallback(() => setShowPullDialog(true), []),
    hidePullDialog,
    showPushDialog: useCallback((branch: string | null) => setShowPushDialog(branch), []),
    hidePushDialog,
    showStashDialog: useCallback(() => setShowStashDialog(true), []),
    hideStashDialog,
    showResetDialog: useCallback(() => setShowResetDialog(true), []),
    hideResetDialog,
    showCleanWorkingDirectoryDialog: useCallback(() => setShowCleanWorkingDirectoryDialog(true), []),
    hideCleanWorkingDirectoryDialog,
    showErrorDialog: useCallback(() => setShowErrorDialog(true), []),
    hideErrorDialog,
    showLocalChangesDialog: useCallback((branch: string) => {
      setPendingBranchSwitch(branch);
      setShowLocalChangesDialog(true);
    }, []),
    hideLocalChangesDialog,
    showCreateBranchDialog: useCallback((fromBranch?: string) => {
      setNewBranchFrom(fromBranch || null);
      setShowCreateBranchDialog(true);
    }, []),
    hideCreateBranchDialog,
    showDeleteBranchDialog: useCallback((branch: string) => {
      setBranchToDelete(branch);
      setShowDeleteBranchDialog(true);
    }, []),
    hideDeleteBranchDialog,
    showRenameBranchDialog: useCallback((branch: string) => {
      setBranchToRename(branch);
      setShowRenameBranchDialog(true);
    }, []),
    hideRenameBranchDialog,
    showMergeBranchDialog: useCallback((sourceBranch: string) => {
      setMergeSourceBranch(sourceBranch);
      setShowMergeBranchDialog(true);
    }, []),
    hideMergeBranchDialog,
    showRebaseBranchDialog: useCallback((sourceBranch: string) => {
      setRebaseSourceBranch(sourceBranch);
      setShowRebaseBranchDialog(true);
    }, []),
    hideRebaseBranchDialog,
    showApplyStashDialog: useCallback((stash: { message: string; index: number }) => {
      setStashToApply(stash);
      setShowApplyStashDialog(true);
    }, []),
    hideApplyStashDialog,
    showRenameStashDialog: useCallback((stash: { message: string; index: number }) => {
      setStashToRename(stash);
      setShowRenameStashDialog(true);
    }, []),
    hideRenameStashDialog,
    showDeleteStashDialog: useCallback((stash: { message: string; index: number }) => {
      setStashToDelete(stash);
      setShowDeleteStashDialog(true);
    }, []),
    hideDeleteStashDialog,
    showCreateBranchFromCommitDialog: useCallback((commit: any) => {
      setCommitForDialog(commit);
      setShowCreateBranchFromCommitDialog(true);
    }, []),
    hideCreateBranchFromCommitDialog,
    showCreateTagFromCommitDialog: useCallback((commit: any) => {
      setCommitForDialog(commit);
      setShowCreateTagFromCommitDialog(true);
    }, []),
    hideCreateTagFromCommitDialog,
    showAmendCommitDialog: useCallback((commit: any) => {
      setCommitForDialog(commit);
      setShowAmendCommitDialog(true);
    }, []),
    hideAmendCommitDialog,
    showPullRequestDialog: useCallback((url: string, branch: string) => {
      setPullRequestUrl(url);
      setPullRequestBranch(branch);
      setShowPullRequestDialog(true);
    }, []),
    hidePullRequestDialog,
  };
}
