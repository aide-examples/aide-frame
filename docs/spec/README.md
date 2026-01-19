# AIDE Frame (Spec)

Language-agnostic specification for aide-frame modules.

## Purpose

The specification defines:
- What each module does (purpose and use cases)
- Required API (functions, parameters, return values)
- Expected behavior (caching, error handling)
- Configuration formats

Implementations (Python, JavaScript, etc.) follow this specification and provide language-specific documentation.

## Guides

| Guide | Description |
|-------|-------------|
| [Application Structure](app-structure.md) | Standard code structure patterns for aide-frame apps |

## Modules

**Server-side:**

| Module | Description |
|--------|-------------|
| [Platform Detection](platform-detect.md) | Detect runtime environment (Raspi, WSL, Linux, macOS) |
| [Logging](logging.md) | Centralized, configurable logging |
| [Paths](paths.md) | Path management and static file serving |
| [Config](config.md) | Configuration loading with defaults and merging |
| [Update](update.md) | GitHub-based remote update with rollback |
| [HTTP](http.md) | HTTP server, routes, API endpoints |

**Client-side:**

| Module | Description |
|--------|-------------|
| [Static Assets](static.md) | CSS framework, JS widgets, i18n, templates |

## Implementations

| Language | Documentation | Status |
|----------|---------------|--------|
| Python | [docs/python/](../python/) | Available |
| JavaScript | [docs/js/](../js/) | Available |
