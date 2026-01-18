# Remote Updates (Spec)

GitHub-based remote update system with staging, backup, and rollback.

## Purpose

Applications deployed on remote devices (e.g., Raspberry Pi) need a safe update mechanism:
- Check for new versions on GitHub
- Download and stage updates before applying
- Backup current version before update
- Rollback on failure
- Disable updates after repeated failures

## Update Flow

```
CHECK → DOWNLOAD → APPLY → VERIFY
                     ↓
                  ROLLBACK (on failure)
```

1. **CHECK**: Compare local VERSION file with GitHub
2. **DOWNLOAD**: Download files to staging directory, verify integrity
3. **APPLY**: Backup current files, copy staging to app directory, restart service
4. **VERIFY**: After stable operation, confirm update; on failure, rollback

## API

### UpdateManager

| Method | Returns | Description |
|--------|---------|-------------|
| `check_for_updates()` | object | Check if update is available |
| `download_update()` | object | Download and stage update |
| `apply_update()` | object | Apply staged update, trigger restart |
| `confirm_update()` | void | Confirm successful update |
| `rollback()` | object | Restore from backup |
| `enable_updates()` | void | Re-enable after failures |

### Version Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `get_local_version()` | string | Read version from VERSION file |

### Check Response

```json
{
    "update_available": true,
    "current_version": "1.2.0",
    "available_version": "1.3.0"
}
```

### Status Response

```json
{
    "current_version": "1.2.0",
    "available_version": "1.3.0",
    "update_available": true,
    "update_state": "idle",
    "can_rollback": false
}
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `true` | Enable/disable updates |
| `source.repo` | string | — | GitHub repository (e.g., "user/repo") |
| `source.branch` | string | `"main"` | Branch to update from |
| `source.use_releases` | bool | `true` | Use GitHub Releases instead of branch |
| `service_name` | string | — | Systemd service name for restart |
| `auto_check` | bool | `true` | Periodically check for updates |
| `auto_check_hours` | int | `24` | Hours between auto-checks |

## Directory Structure

```
project/
├── app/                    # Application files
│   └── VERSION             # Current version
└── .update/
    ├── staging/            # Downloaded update
    ├── backup/             # Backup of previous version
    └── state.json          # Update state
```

## Safety Features

### Backup Before Apply

All current application files are backed up before applying an update.

### Automatic Rollback

If the application fails to start after update, rollback is triggered automatically.

### Failure Limit

After 2 consecutive failed updates, updates are disabled. Call `enable_updates()` to reset.

### Staged Downloads

Updates are downloaded and verified in a staging area before being applied.

## Version Format

Semantic versioning recommended: `MAJOR.MINOR.PATCH`

Examples: `1.0.0`, `1.2.3`, `2.0.0-beta`

Version comparison is lexicographic; ensure consistent format.

## Web UI

The update system includes a web-based management interface. See [Static Assets](static.md#updatehtml) for the client-side UI (`update.html`, `update.js`).

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [update.py](../python/update.md) | Available |
| JavaScript | update.js | Available |
