# Path Management (Python)

**Module:** `paths.py` | [Spec](../spec/paths.md)

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

# Register app-specific paths
paths.register("DOCS_DIR", os.path.join(paths.APP_DIR, "docs"))

# Access registered paths
print(paths.DOCS_DIR)         # Attribute access
print(paths.get("DOCS_DIR"))  # Function access
```

## Exports

```python
from aide_frame import paths
from aide_frame.paths import resolve_safe_path, PathSecurityError, MIME_TYPES
```

- `init(app_dir)` - Initialize paths with app directory
- `register(name, path)` - Register a named path
- `get(name)` - Get registered path by name
- `resolve_safe_path(path, base_dir=None)` - Safely resolve path (blocks `..`)
- `MIME_TYPES` - Dict mapping file extensions to MIME types

## Path Security

```python
from aide_frame.paths import resolve_safe_path, PathSecurityError

try:
    path = resolve_safe_path("../../../etc/passwd")
except PathSecurityError as e:
    print(f"Blocked: {e}")
```

## Implementation Details

- Paths stored as module-level variables
- `register()` uses `setattr()` for attribute access
- `resolve_safe_path()` uses `os.path.normpath()` for normalization
