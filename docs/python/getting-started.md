# Getting Started (Python)

Guide for creating a new aide-frame application.

## Project Structure

```
my-app/
├── aide-frame/              # Git submodule
│   └── python/
│       └── aide_frame/
├── app/
│   ├── main.py              # Main entry point
│   ├── static/
│   │   └── index.html       # Web UI
│   ├── docs/                # Documentation (optional)
│   │   └── index.md
│   ├── help/                # User help (optional)
│   │   └── index.md
│   ├── sample_config.json   # Config template (in repo)
│   └── config.json          # User config (in .gitignore)
└── .gitignore
```

## Canonical Initialization Order

**Important:** This order must be followed in every aide-frame app!

```python
#!/usr/bin/env python3
"""My App - Description."""

import os
import sys

# =============================================================================
# 1. PATH SETUP - Must be done before importing aide-frame
# =============================================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

# Add aide-frame to Python path (submodule)
AIDE_FRAME_PATH = os.path.join(PROJECT_DIR, 'aide-frame', 'python')
if os.path.isdir(AIDE_FRAME_PATH) and AIDE_FRAME_PATH not in sys.path:
    sys.path.insert(0, AIDE_FRAME_PATH)

# =============================================================================
# 2. AIDE-FRAME INIT - paths.init() MUST come before other aide-frame imports
# =============================================================================

from aide_frame import paths
paths.init(SCRIPT_DIR)

# =============================================================================
# 3. AIDE-FRAME IMPORTS - Safe now that paths is initialized
# =============================================================================

from aide_frame import http_routes, http_server
from aide_frame.log import logger, set_level
from aide_frame.config import load_config

# =============================================================================
# 4. APP-SPECIFIC IMPORTS (optional)
# =============================================================================

# from my_module import MyClass
```

### Why This Order?

1. **PATH SETUP** must come first so Python can find aide-frame
2. **paths.init()** registers APP_DIR and enables auto-registration of docs/help
3. **Other aide-frame imports** can then proceed safely, e.g., `DocsConfig` uses paths
4. **App-specific imports** come last

## Minimal App (hello-style)

```python
#!/usr/bin/env python3
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

AIDE_FRAME_PATH = os.path.join(PROJECT_DIR, 'aide-frame', 'python')
if os.path.isdir(AIDE_FRAME_PATH) and AIDE_FRAME_PATH not in sys.path:
    sys.path.insert(0, AIDE_FRAME_PATH)

from aide_frame import paths
paths.init(SCRIPT_DIR)

from aide_frame import http_routes, http_server
from aide_frame.log import set_level


class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/':
            return self.file('index.html')
        if path == '/api/hello':
            name = params.get('name', 'World')
            return {'message': f'Hello, {name}!'}
        return {'error': 'Not found'}, 404


def main():
    set_level('INFO')

    docs_config = http_routes.DocsConfig(
        app_name="My App",
        back_link="/",
        back_text="Home",
    )

    server = http_server.HttpServer(
        port=8080,
        handler_class=MyHandler,
        app_dir=SCRIPT_DIR,
        docs_config=docs_config,
    )
    server.run()


if __name__ == '__main__':
    main()
```

## Static Files

Create `app/static/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My App</title>
    <link rel="stylesheet" href="/static/frame/css/base.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>My App</h1>
            <a href="/help" class="header-link">?</a>
        </div>
        <div class="card">
            <p>Hello World!</p>
        </div>
    </div>
</body>
</html>
```

aide-frame provides `base.css` at `/static/frame/css/base.css`.

## Adding Documentation

Create `app/docs/index.md`:

```markdown
# My App

Brief description of the app.

## Features

- Feature 1
- Feature 2
```

The documentation is then accessible at `/about`.

## Adding User Help

Create `app/help/index.md`:

```markdown
# My App - Help

Welcome! This page explains how to use the app.

## First Steps

1. Step one
2. Step two
```

The help is then accessible at `/help`.

## Configuration

Create `app/sample_config.json` (tracked in repo):

```json
{
    "_comment": "Copy this file to config.json and customize",
    "port": 8080,
    "log_level": "INFO"
}
```

Add to `.gitignore`:

```
# User config (not tracked)
app/config.json
```

Loading in the app:

```python
from aide_frame.config import load_config

config_path = os.path.join(SCRIPT_DIR, 'config.json')
config = load_config(config_path, defaults={'port': 8080})
```

See [Config](config.md) for details on the sample config pattern.

## aide-frame as Submodule

```bash
git submodule add ../aide-frame aide-frame
git submodule update --init
```

Update to latest version:

```bash
git submodule update --remote aide-frame
git add aide-frame
git commit -m "Update aide-frame"
```

## Next Steps

- [HTTP Server](http-server.md) - JsonHandler and HttpServer details
- [HTTP Routes](http-routes.md) - DocsConfig and viewer API
- [Paths](paths.md) - Path management
- [Config](config.md) - Configuration files
- [Logging](logging.md) - Logger usage
