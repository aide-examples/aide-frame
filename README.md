# AIDE - Frame

Lightweight application framework with server-side (Python) and client-side (JS/CSS) components, especially suited for Raspberry Pi deployments.

## Features

**Server-side:**
- **Platform Detection** - Auto-detect Raspberry Pi, WSL, Linux, macOS
- **Logging** - Configurable logging with systemd-friendly output
- **Path Management** - Centralized path handling and static file serving
- **Configuration** - JSON-based config with defaults and deep merge
- **Remote Updates** - GitHub-based update mechanism with rollback
- **HTTP Server** - Web server with JSON API, docs viewer

**Client-side:**
- **CSS Framework** - Base styles, cards, buttons, forms, status displays
- **JavaScript Widgets** - HeaderWidget, StatusWidget, Update UI
- **Internationalization** - i18n with EN/DE/ES, Google Translate integration
- **Documentation Viewer** - Markdown rendering, Mermaid diagrams, TOC

## Documentation

- [Specification](docs/spec/README.md) - Language-agnostic API and behavior
- [Python](docs/python/index.md) - Python implementation and examples
- [Getting Started](docs/python/guide.md) - Quick start guide

## Structure

```
aide-frame/
├── docs/
│   ├── spec/           # Language-agnostic specification
│   └── python/         # Python implementation docs
└── python/
    └── aide_frame/     # Python source code
        └── static/     # Shared frontend assets (CSS, JS, i18n)
```

## License

MIT
