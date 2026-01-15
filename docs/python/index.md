# AIDE Frame (Python)

Python implementation of [AIDE Frame](../spec/README.md).

## Overview

AIDE Frame provides common infrastructure for Python applications:

- **Logging** - Centralized, configurable logging with systemd-friendly output
- **Path Management** - Base paths with extensible registration for app-specific paths
- **Configuration** - JSON config loading with deep merge and defaults support
- **Platform Detection** - Automatic detection of Raspberry Pi, WSL2, Linux desktop, etc.
- **Remote Updates** - GitHub-based update system with rollback support

## Core Modules

| Module | Spec | Description |
|--------|------|-------------|
| [Logging](logging.md) | [spec](../spec/logging.md) | Logger configuration and usage |
| [Paths](paths.md) | [spec](../spec/paths.md) | Path management and registration |
| [Config](config.md) | [spec](../spec/config.md) | Loading and merging configuration files |
| [Platform Detection](platform-detect.md) | [spec](../spec/platform-detect.md) | Platform detection (Raspi, WSL, etc.) |
| [Remote Updates](update.md) | [spec](../spec/update.md) | GitHub-based update system |

## HTTP Components

| Module | Description |
|--------|-------------|
| [HTTP Server](http-server.md) | HttpServer and JsonHandler for web apps |
| [HTTP Routes](http-routes.md) | DocsConfig and viewer API |
| [Update Routes](update-routes.md) | Remote update UI and API |
| [Widgets](widgets.md) | JavaScript widgets (Header, Status) |
| [Docs Viewer](docs-viewer.md) | Markdown rendering for docs and help |

## Guides

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Create a new app, canonical initialization |
| [Architecture](architecture.md) | Framework/application separation, build and release process |

## Quick Start

```python
#!/usr/bin/env python3
import os
import sys

# 1. PATH SETUP
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
AIDE_FRAME_PATH = os.path.join(PROJECT_DIR, 'aide-frame', 'python')
if os.path.isdir(AIDE_FRAME_PATH) and AIDE_FRAME_PATH not in sys.path:
    sys.path.insert(0, AIDE_FRAME_PATH)

# 2. AIDE-FRAME INIT
from aide_frame import paths
paths.init(SCRIPT_DIR)

# 3. AIDE-FRAME IMPORTS
from aide_frame import http_routes, http_server, update_routes
from aide_frame.log import set_level


class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/':
            return self.file('index.html')
        if path == '/api/hello':
            return {'message': 'Hello, World!'}
        return {'error': 'Not found'}, 404


def main():
    set_level('INFO')
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


if __name__ == '__main__':
    main()
```

See [Getting Started](getting-started.md) for a complete guide.
