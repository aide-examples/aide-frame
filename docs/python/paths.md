# Path Management

**Module:** `paths.py`

Python implementation of [Path Management](../spec/paths.md).

## Usage

```python
from aide_frame import paths
import os

# Initialize (required before using paths)
paths.init(SCRIPT_DIR)

# Access base paths
print(paths.APP_DIR)       # /path/to/app
print(paths.PROJECT_DIR)   # /path/to (parent)
print(paths.STATIC_DIR)    # /path/to/app/static
print(paths.VERSION_FILE)  # /path/to/app/VERSION

# Register app-specific paths
paths.register("DOCS_DIR", os.path.join(paths.APP_DIR, "docs"))
paths.register("CACHE_DIR", os.path.join(paths.APP_DIR, ".cache"))

# Access registered paths
print(paths.DOCS_DIR)         # /path/to/app/docs
print(paths.get("CACHE_DIR")) # Alternative access
```

## API

```python
from aide_frame import paths
from aide_frame.paths import resolve_safe_path, PathSecurityError, MIME_TYPES
```

### Functions

| Function | Description |
|----------|-------------|
| `init(app_dir)` | Initialize paths with app directory |
| `register(name, path)` | Register a named path |
| `get(name)` | Get registered path by name |
| `resolve_safe_path(path, base_dir=None)` | Safely resolve a path |

### Path Security

```python
from aide_frame.paths import resolve_safe_path, PathSecurityError

# Relative paths resolved against PROJECT_DIR
path = resolve_safe_path("img/uploads")  # -> /project/img/uploads

# Custom base directory
path = resolve_safe_path("uploads", base_dir="/var/www")

# Path traversal blocked
try:
    path = resolve_safe_path("../../../etc/passwd")
except PathSecurityError as e:
    print(f"Blocked: {e}")
```

### MIME Types

```python
from aide_frame.paths import MIME_TYPES

ext = '.html'
content_type = MIME_TYPES.get(ext, 'application/octet-stream')
```

## Implementation Details

- Paths stored as module-level variables
- `register()` uses `setattr()` for attribute access
- `resolve_safe_path()` uses `os.path.normpath()` for normalization
- Path traversal check: reject if `..` in normalized path
