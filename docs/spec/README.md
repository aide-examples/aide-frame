# aide-frame Specification

Language-agnostic specification for aide-frame modules.

## Purpose

The specification defines:
- What each module does (purpose and use cases)
- Required API (functions, parameters, return values)
- Expected behavior (caching, error handling)
- Configuration formats

Implementations (Python, JavaScript, etc.) follow this specification and provide language-specific documentation.

## Modules

| Module | Description |
|--------|-------------|
| [Platform Detection](platform-detect.md) | Detect runtime environment (Raspi, WSL, Linux, macOS) |
| [Logging](logging.md) | Centralized, configurable logging |
| [Paths](paths.md) | Path management and static file serving |
| [Config](config.md) | Configuration loading with defaults and merging |
| [Update](update.md) | GitHub-based remote update with rollback |

## Implementations

| Language | Documentation | Status |
|----------|---------------|--------|
| Python | [docs/python/](../python/) | Available |
| JavaScript | docs/js/ | Planned |
