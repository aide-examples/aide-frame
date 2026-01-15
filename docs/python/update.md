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

result = manager.check_for_updates()
if result["update_available"]:
    manager.download_update()
    manager.apply_update()  # triggers restart

# After successful restart
manager.confirm_update()

# Or rollback on failure
manager.rollback()
```

## Exports

```python
from aide_frame.update import UpdateManager, get_local_version
```

- `UpdateManager(config)` - Update manager instance
- `get_local_version()` - Read version from VERSION file

See [Spec](../spec/update.md) for methods and configuration options.

## Implementation Details

- Uses `urllib.request` for GitHub API calls
- Downloads tarballs from GitHub Releases or branch
- Service restart via `systemctl restart`
- State persisted in `.update/state.json`
