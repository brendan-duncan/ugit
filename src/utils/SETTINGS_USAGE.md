# Settings System Usage

This document explains how to use the new settings system in ugit.

## Overview

The settings system provides:
- Persistent storage of application settings
- Default values for all settings
- React hooks for easy integration
- Utility functions for non-React contexts

## Available Settings

1. **localFileRefreshTime** (number): How often to refresh local file status (default: 5 seconds)
2. **blockCommitBranches** (string[]): Branch patterns where commits should be blocked (default: ['trunk', '*/staging'])

## Usage in React Components

### Using the useSettings Hook

```tsx
import React from 'react';
import { useSettings } from '../hooks/useSettings';

function MyComponent() {
  const { settings, loading, updateSetting, getSetting } = useSettings();

  const handleRefreshTimeChange = (newTime: number) => {
    updateSetting('localFileRefreshTime', newTime);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <p>Current refresh time: {getSetting('localFileRefreshTime')}s</p>
      <button onClick={() => handleRefreshTimeChange(10)}>
        Set to 10 seconds
      </button>
    </div>
  );
}
```

### Opening Settings Dialog

```tsx
import { useState } from 'react';
import { SettingsDialog } from '../components/SettingsDialog';

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div>
      <button onClick={() => setShowSettings(true)}>
        Open Settings
      </button>
      
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
```

## Usage in Non-React Contexts

### Using SettingsUtils

```typescript
import { SettingsUtils } from '../utils/settingsUtils';

// Check if a branch should be blocked
async function canCommitToBranch(branchName: string): Promise<boolean> {
  const isBlocked = await SettingsUtils.shouldBlockCommit(branchName);
  return !isBlocked;
}

// Get current refresh time
async function getRefreshInterval(): Promise<number> {
  return await SettingsUtils.getLocalFileRefreshTime();
}

// Get all blocked patterns
async function getBlockedPatterns(): Promise<string[]> {
  return await SettingsUtils.getBlockedBranchPatterns();
}
```

## Pattern Matching

The `blockCommitBranches` setting supports simple pattern matching:

- Exact matches: `"trunk"` matches branch named "trunk"
- Wildcard prefixes: `"feature/*"` matches "feature/login", "feature/api", etc.
- Global wildcards: `"*staging*"` matches "dev/staging", "staging-hotfix", etc.

## IPC Communication

The settings system uses Electron's IPC system:

- `get-settings`: Returns current settings object
- `update-setting`: Updates a single setting value
- `update-settings`: Updates multiple settings at once
- `reset-settings`: Resets all settings to defaults

## Storage

Settings are stored in the app's user data directory using the existing cache manager system. The settings are automatically loaded when the app starts and persisted when changed.