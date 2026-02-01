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
- Added `showStashConflictDialog` state for conflict handling
- Added `currentBranch` and `branchStatus` props for status checking
- Enhanced `handleCommit` to check ahead/behind status
- Added `performCommit` function with robust stashing and pull functionality
- Added `handlePullAndCommit` and `handleCommitOnly` handlers
- Implemented comprehensive conflict handling for stash apply operations

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

### StashConflictDialog

**File**: `src/components/StashConflictDialog.tsx`

A new dialog component for handling stash conflicts with informative message and user acknowledgement. Provides clear explanation of conflicts and guidance for manual resolution.

## Remote Management Features

### Remote Action Menu Button

**Added**: "..." button to each remote in the remote list
- Positioned in the remote header next to the URL
- Opens context menu on click with various actions

### Remote Action Menu Options

**File**: `src/components/RemoteList.tsx` (enhanced)

1. **Edit Remote**: Opens EditRemoteDialog to change remote URL
2. **Delete Remote**: Opens DeleteRemoteDialog for confirmation
3. **Separator**: Visual separator between destructive and utility actions
4. **Open Remote in Browser**: Opens remote URL in default browser
5. **Copy Remote Address**: Copies remote URL to clipboard

### EditRemoteDialog Component

**File**: `src/components/EditRemoteDialog.tsx` (new)

Features:
- Pre-fills with current remote name and URL
- Remote name is read-only (cannot be changed to maintain stability)
- URL field is editable and focused
- Validation for URL format
- Loading states and error handling

### DeleteRemoteDialog Component

**File**: `src/components/DeleteRemoteDialog.tsx` (new)

Features:
- Displays remote name and URL for confirmation
- Warning that action cannot be undone
- Focus on safety with clear confirmation language

### Enhanced GitAdapter Methods

**Added**: `editRemote(remoteName: string, newUrl: string)` method
**Existing**: `removeRemote(remoteName: string)` method utilized

### CSS Enhancements

**File**: `src/components/RemoteList.css` (enhanced)

New styles added:
- `.remote-action-button`: Context menu button styling
- `.remote-action-menu`: Floating dropdown menu container
- `.remote-action-menu-item`: Individual menu item styling
- `.remote-action-menu-item-separator`: Visual separator

### User Experience Improvements

- **Visual Feedback**: Hover states and transitions
- **Keyboard Support**: Enter key support in dialogs
- **Error Handling**: Comprehensive validation and user feedback
- **State Management**: Proper dialog visibility management
- **Clipboard Integration**: Native clipboard API usage

No breaking changes were introduced - the functionality is additive and respects all existing workflows.

## Enhanced Stashing Logic

The `performCommit` function now implements robust stashing workflow:

### Before Pull:
1. **Stash Local Changes**: Creates automatic stash with timestamp
2. **Pull Remote Changes**: Fetches latest changes from origin/currentBranch
3. **Apply Stash**: Attempts to merge stashed changes with remote changes
4. **Clean Up**: Removes stash on successful apply

### Conflict Handling:
- **Successful Apply**: Stash is popped and removed
- **Conflict Detected**: Shows StashConflictDialog and aborts commit
- **Pull Failure**: Attempts to restore original stashed changes

### Error Recovery:
- **Pull Failures**: Automatic stash restoration to preserve user's work
- **Apply Conflicts**: Clear error message with next steps for user
- **Graceful Degradation**: System remains stable even on failures

No breaking changes were introduced - the functionality is additive and respects all existing workflows.