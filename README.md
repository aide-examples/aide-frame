# AIDE Frame

Lightweight application framework for Python projects, especially suited for Raspberry Pi deployments.

## Features

- **Platform Detection** - Auto-detect Raspberry Pi, WSL, Linux, macOS
- **Logging** - Configurable logging with systemd-friendly output
- **Path Management** - Centralized path handling and static file serving
- **Configuration** - JSON-based config with defaults and deep merge
- **Remote Updates** - GitHub-based update mechanism with rollback
- **HTTP Server** - Web server with JSON API, docs viewer, widgets

## Documentation

See [docs/](docs/index.md) for full documentation:
- [Specification](docs/spec/README.md) - Language-agnostic API and behavior
- [Python Implementation](docs/python/index.md) - Python usage and examples

## Quick Start

```python
#!/usr/bin/env python3
import os, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(SCRIPT_DIR), 'aide-frame', 'python'))

from aide_frame import paths
paths.init(SCRIPT_DIR)

from aide_frame import http_routes, http_server

class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/': return self.file('index.html')
        return {'error': 'Not found'}, 404

http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
).run()
```

## Usage

### As Git Submodule (development)

```bash
git submodule add ../aide-frame aide-frame
```

### For Production

Copy `python/aide_frame/` into your app directory. See [Guide](docs/python/guide.md).

## Structure

```
aide-frame/
├── docs/
│   ├── spec/           # Language-agnostic specification
│   └── python/         # Python implementation docs
└── python/
    └── aide_frame/     # Python source code
```

## License

MIT
