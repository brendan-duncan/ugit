# Git Backend Selection

ugit now supports multiple git backend implementations that can be switched using command-line arguments.

**Only simple-git currently works!**

## Available Backends

### 1. **simple-git** (Default)
- Uses the `simple-git` npm package
- Wraps native git CLI commands
- Good balance of features and performance
- Most tested and stable option

### 2. **es-git**
- Uses the `es-git` npm package
- Pure JavaScript implementation
- Designed for browser and Node.js environments

## Usage

To specify a backend, use the `--git-backend` command-line argument:

```bash
# Use simple-git (default)
npm start

# Use simple-git (explicit)
npm start -- --git-backend=simple-git

# Use es-git
npm start -- --git-backend=es-git
```

## Architecture

The implementation uses an adapter pattern with async initialization:

```
GitAdapter (abstract base class)
├── SimpleGitAdapter (uses simple-git package)
└── EsGitAdapter (uses es-git package)
```

All adapters follow a two-step initialization pattern:
1. **Constructor**: Sets up basic properties (synchronous)
2. **open()**: Asynchronously initializes the repository connection
3. **GitFactory.createAdapter()**: Handles both steps automatically

### Key Components

1. **GitAdapter** ([src/git/GitAdapter.js](src/git/GitAdapter.js))
   - Abstract base class defining the interface
   - Provides `open()` method for async initialization
   - All adapters must implement these methods

2. **GitFactory** ([src/git/GitFactory.js](src/git/GitFactory.js))
   - Factory for creating and opening adapter instances
   - Handles backend selection logic
   - Returns fully initialized adapters (async)

3. **Adapters** ([src/git/](src/git/))
   - SimpleGitAdapter.js
   - EsGitAdapter.js

### Supported Operations

All adapters support:
- Repository status
- Branch management
- Staging/unstaging files
- Committing changes
- Stash operations
- Fetch/pull/push
- Diff viewing
- Ahead/behind tracking

## Performance Notes

- **simple-git**: Best overall performance after parallelization optimizations, wraps git CLI
- **es-git**: Pure JavaScript implementation, may be slower for some operations

All backends use parallelized branch status checks for improved performance with repositories containing many branches.

## Backend Selection Logic

The backend is:
1. Specified via `--git-backend` command-line argument
2. Parsed in [main.js](main.js) on startup
3. Provided to renderer process via IPC
4. Used by components to create git adapters

## Adding New Backends

To add a new backend:

1. Create a new adapter class extending `GitAdapter`
2. Override `async open()` to initialize the repository connection
3. Implement all required git operation methods
4. Add the backend to `GitFactory.createAdapter()`
5. Update this documentation

Example:
```javascript
class MyGitAdapter extends GitAdapter {
  constructor(repoPath) {
    super(repoPath);
    this.client = null;
  }

  async open() {
    await super.open();
    this.client = await initializeMyGitClient(this.repoPath);
  }

  async status() {
    return await this.client.getStatus();
  }
  // ... implement other methods
}
```
