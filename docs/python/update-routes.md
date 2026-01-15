# Update Routes (Python)

The `update_routes` module provides HTTP routes and UI for remote updates.

## Overview

```python
from aide_frame import http_server, update_routes

server = http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    update_config=update_routes.UpdateConfig(
        github_repo="username/repo",
        service_name="myapp"
    ),
)
```

## UpdateConfig

Configuration for the update system.

```python
update_routes.UpdateConfig(
    github_repo="username/repo",  # GitHub repository (required)
    version_file="VERSION",       # File with version number
    service_name="myapp",         # Service name for systemctl restart
    use_releases=True,            # Use GitHub Releases
    branch="main",                # Branch (if use_releases=False)
    show_memory=True,             # Show memory usage in status
    show_restart=True,            # Show restart button
)
```

## Provided Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/update` | GET | Update management page (HTML) |
| `/api/update/status` | GET | Current status (JSON) |
| `/api/update/check` | POST | Check for updates |
| `/api/update/download` | POST | Download update |
| `/api/update/apply` | POST | Apply update and restart |
| `/api/update/rollback` | POST | Roll back to previous version |
| `/api/update/enable` | POST | Re-enable updates after failures |
| `/api/restart` | POST | Restart server |

## Status API Response

```json
{
  "current_version": "1.2.0",
  "available_version": "1.3.0",
  "update_available": true,
  "version_comparison": "update_available",
  "update_state": "idle",
  "platform": "wsl2",
  "memory": {
    "used_mb": 23.5,
    "total_mb": 5799
  },
  "can_rollback": false
}
```

### version_comparison Values

| Value | Meaning |
|-------|---------|
| `update_available` | Newer version available |
| `up_to_date` | Current |
| `local_ahead` | Local version is newer (development) |
| `unknown` | Not yet checked |

## Update Page

The `/update` route delivers a complete HTML page with:

- Version display (current/available)
- Status badge (Up to Date, Update Available, etc.)
- Buttons: Check, Download, Install, Rollback
- Update source info (repository, branch)

## Integration with StatusWidget

The StatusWidget can use the update API:

```html
<div id="status-widget"></div>
<script src="/static/frame/js/status-widget.js"></script>
<script>
    StatusWidget.init('#status-widget');
</script>
```

See [Widgets](widgets.md) for details.

## Example

```python
#!/usr/bin/env python3
from aide_frame import http_server, http_routes, update_routes

class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/':
            return self.file('index.html')
        return {'error': 'Not found'}, 404

server = http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
    update_config=update_routes.UpdateConfig(
        github_repo="username/myapp",
        service_name="myapp"
    ),
)
server.run()
```

## See Also

- [HTTP Server](http-server.md) - Server configuration
- [Widgets](widgets.md) - StatusWidget and HeaderWidget
- [Update](update.md) - Update manager details
