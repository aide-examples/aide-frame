# Remote Updates

**Module:** `update.py`

Python implementation of [Remote Updates](../spec/update.md).

## Usage

```python
from aide_frame.update import UpdateManager, get_local_version

# Configure
config = {
    "enabled": True,
    "source": {
        "repo": "username/repo-name",
        "branch": "main"
    },
    "service_name": "myapp"
}

manager = UpdateManager(config)

# Check for updates
result = manager.check_for_updates()
if result["update_available"]:
    print(f"Update available: {result['available_version']}")

# Download and stage
result = manager.download_update()

# Apply update (triggers restart)
result = manager.apply_update()

# After successful startup, confirm
manager.confirm_update()

# Or rollback if something went wrong
manager.rollback()
```

## API

```python
from aide_frame.update import UpdateManager, get_local_version
```

### UpdateManager Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `check_for_updates()` | `dict` | Check if update is available |
| `download_update()` | `dict` | Download and stage update |
| `apply_update()` | `dict` | Apply staged update, trigger restart |
| `confirm_update()` | `None` | Confirm successful update |
| `rollback()` | `dict` | Restore from backup |
| `enable_updates()` | `None` | Re-enable after failures |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `True` | Enable/disable updates |
| `source.repo` | str | — | GitHub repo (e.g., "user/repo") |
| `source.branch` | str | `"main"` | Branch to update from |
| `source.use_releases` | bool | `True` | Use GitHub Releases |
| `service_name` | str | — | Systemd service name |
| `updateable_dirs` | list | `[]` | Directories where files can be deleted |
| `required_files` | list | `["VERSION"]` | Files that must be downloaded |
| `auto_check` | bool | `True` | Periodically check for updates |
| `auto_check_hours` | int | `24` | Hours between auto-checks |

## HTTP API Integration

When used with the HTTP server:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/update/status` | GET | Current update status |
| `/api/update/check` | POST | Check for updates |
| `/api/update/download` | POST | Download and stage |
| `/api/update/apply` | POST | Apply staged update |
| `/api/update/rollback` | POST | Rollback to backup |

## Safety Features

- **Backup before apply**: All current files backed up to `.update/backup/`
- **Rollback on failure**: Automatic restore if update fails
- **Failure limit**: Updates disabled after 2 consecutive failures
- **Re-enable**: Call `manager.enable_updates()` to reset

## Implementation Details

- Uses `urllib.request` for GitHub API calls
- Downloads tarballs from GitHub Releases or branch
- Checksums verified after download
- Service restart via `systemctl restart`
- State persisted in `.update/state.json`
