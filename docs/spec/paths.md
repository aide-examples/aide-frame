# Path Management (Spec)

Centralized path management with extensible registration.

## Purpose

Applications need consistent path handling:
- Locate application and project directories
- Register and access named paths
- Serve static files with correct MIME types
- Protect against path traversal attacks

## Base Paths

| Path | Description |
|------|-------------|
| `APP_DIR` | Application directory (contains main code, config.json) |
| `PROJECT_DIR` | Parent of APP_DIR (repository root) |
| `STATIC_DIR` | Static files directory (APP_DIR/static) |
| `VERSION_FILE` | Version file path (APP_DIR/VERSION) |
| `UPDATE_STATE_DIR` | Update state directory (PROJECT_DIR/.update) |

## API

### Initialization

| Function | Parameters | Description |
|----------|------------|-------------|
| `init(app_dir)` | app_dir: string (optional) | Initialize paths; auto-detects if not provided |

### Path Registration

| Function | Parameters | Description |
|----------|------------|-------------|
| `register(name, path)` | name: string, path: string | Register a named path |
| `get(name)` | name: string | Get a registered path by name |

### Path Security

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `resolve_safe_path(path, base_dir)` | path: string, base_dir: string (optional) | string | Resolve path safely |

### MIME Types

A mapping from file extensions to MIME types for static file serving.

| Extension | MIME Type |
|-----------|-----------|
| `.html` | `text/html` |
| `.css` | `text/css` |
| `.js` | `application/javascript` |
| `.json` | `application/json` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.webp` | `image/webp` |
| `.md` | `text/markdown` |
| `.txt` | `text/plain` |
| `.xml` | `application/xml` |
| `.pdf` | `application/pdf` |

## Behavior

### Initialization

- Must be called before accessing paths
- If `app_dir` not provided, detect from calling script location
- Set all base paths relative to `app_dir`

### Path Registration

- Registered paths accessible as module attributes
- Also accessible via `get(name)` function
- Names should be uppercase with underscores (e.g., `DOCS_DIR`)

### Path Security

Path traversal protection:
- Block paths containing `..`
- Relative paths resolved against base directory
- Absolute paths normalized but allowed
- Throw `PathSecurityError` on violation

### Error Handling

| Error | Condition |
|-------|-----------|
| `PathSecurityError` | Path contains traversal sequences (`..`) |

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [paths.py](../python/paths.md) | Available |
| JavaScript | — | Planned |
