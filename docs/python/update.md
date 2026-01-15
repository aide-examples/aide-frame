# Remote Updates (Python)

**Module:** `update.py` | [Spec](../spec/update.md)

## Usage

```python
from aide_frame.update import UpdateManager, get_local_version

manager = UpdateManager({
    "enabled": True,
    "source": {"repo": "username/repo-name", "branch": "main"},
    "service_name": "myapp"
})

# Check for updates
result = manager.check_for_updates()
if result["update_available"]:
    print(f"Update available: {result['available_version']}")

# Download, apply, confirm
manager.download_update()
manager.apply_update()  # triggers restart
manager.confirm_update()

# Or rollback
manager.rollback()
```

## Exports

```python
from aide_frame.update import UpdateManager, get_local_version
```

- `UpdateManager(config)` - Update manager instance
- `get_local_version()` - Read version from VERSION file

### UpdateManager Methods

- `check_for_updates()` - Check if update is available
- `download_update()` - Download and stage update
- `apply_update()` - Apply staged update, trigger restart
- `confirm_update()` - Confirm successful update
- `rollback()` - Restore from backup
- `enable_updates()` - Re-enable after failures

## HTTP Integration

See [Update Routes](update-routes.md) for HTTP API endpoints (`/api/update/status`, etc.).

## Implementation Details

- Uses `urllib.request` for GitHub API calls
- Downloads tarballs from GitHub Releases or branch
- Service restart via `systemctl restart`
- State persisted in `.update/state.json`
- Auto-disables after 2 consecutive failures
