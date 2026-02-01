# Pull Commit Dialog Implementation

This document describes the implementation of the "Pull & Commit" functionality that checks for remote branch ahead status when attempting to commit.

## Overview

When a user clicks the **Commit** button, the system now:

1. **Checks the current branch status** to see if the remote branch is ahead of the local branch
2. **Shows a warning dialog** if the remote branch is ahead
3. **Provides three options** for the user:
   - **Pull & Commit**: Pull latest changes first, then commit
   - **Commit**: Commit without pulling (user choice)
   - **Cancel**: Cancel the commit operation

## Components

### PullCommitDialog

**File**: `src/components/PullCommitDialog.tsx`

A new dialog component that provides options when the remote branch is ahead:

- **Primary Button**: "Pull & Commit" (orange color)
- **Secondary Button**: "Commit" (orange color) 
- **Cancel Button**: "Cancel" (standard cancel styling)

The dialog includes informative text explaining the situation and recommending the pull option.

### Enhanced LocalChangesPanel

**Modified**: `src/components/LocalChangesPanel.tsx`

Key changes:
- Added `showPullCommitDialog` state for dialog visibility
- Added `currentBranch` and `branchStatus` props for status checking
- Enhanced `handleCommit` to check ahead/behind status
- Added `performCommit` function with optional pull functionality
- Added `handlePullAndCommit` and `handleCommitOnly` handlers

### Enhanced ContentViewer & RepositoryView

**Modified**: `src/components/ContentViewer.tsx` and `src/components/RepositoryView.tsx`

- Added `branchStatus` prop passing from RepositoryView to LocalChangesPanel
- Ensured branch status data is available for ahead/behind checking

## User Flow

### Normal Flow (Remote is NOT ahead)

1. User clicks **Commit** button
2. System checks branch status
3. No ahead status detected → commits directly
4. Files are committed normally

### Warning Flow (Remote IS ahead)

1. User clicks **Commit** button  
2. System detects `branchStatus[currentBranch].behind > 0`
3. **PullCommitDialog** appears with warning message
4. User chooses one of three options:

#### Option 1: Pull & Commit
- Dialog closes
- System pulls from `origin/{currentBranch}`
- File lists are refreshed to capture any new changes
- Commit proceeds with user's message
- Branch status is refreshed to update counts

#### Option 2: Commit  
- Dialog closes
- Commit proceeds directly without pulling
- User takes responsibility for potential conflicts

#### Option 3: Cancel
- Dialog closes
- No actions are taken
- User can manually pull first if desired

## Technical Details

### Status Checking Logic

```typescript
const needsPull = branchStatus[currentBranch]?.behind > 0;
```

### Pull Implementation

Uses existing Git adapter method:
```typescript
await git.pull('origin', currentBranch);
```

### Error Handling

- Pull errors are caught and logged
- Commit errors follow existing error handling patterns
- Dialog closes appropriately after any choice

### Styling

- **Primary button** (Pull & Commit): Orange theme (`#ffa500`)
- **Secondary button** (Commit): Orange theme (`#ffa500`) 
- Consistent with existing dialog patterns
- Hover and active states for all buttons

## Integration

The implementation integrates seamlessly with existing:
- Git adapter methods (`pull`, `commit`)
- Branch status tracking system
- Dialog rendering patterns
- Error handling patterns
- State management patterns

No breaking changes were introduced - the functionality is additive and respects all existing workflows.