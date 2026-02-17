## Installation

### macOS
If macOS shows a security warning saying "ugit is damaged and can't be opened", run this command:
```bash
xattr -cr /Applications/ugit.app
```
The application isn't being properly signed currently, so this is required to bypass Gatekeeper's checks.
