# Start Your Own App (Python)

Platform-specific details for creating a Python aide-frame application.

See [Start Your Own App](../start-your-own-app.md) for the complete guide.

## What Gets Created

| File | Purpose |
|------|---------|
| `requirements.txt` | Python dependencies |
| `run` | Startup script |
| `app/{name}.py` | Server entry point |
| `app/config.json` | Configuration (port, PWA settings) |
| `app/VERSION` | Version number |
| `app/static/{name}/` | HTML, JS, CSS |
| `app/static/icons/` | PWA icons (icon-192.svg, icon-512.svg) |
| `app/static/locales/` | i18n translations |
| `app/docs/index.md` | About page content |
| `app/help/index.md` | Help page content |
| `.gitignore` | Excludes venv, __pycache__ |

## Dependencies

The `requirements.txt` typically includes:

```
# aide-frame is included as a git submodule, not a pip package
```

## Run Script

The `run` script creates a virtual environment if needed:

```bash
#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi
python app/{name}.py "$@"
```

## Server Entry Point

The main Python file (`app/{name}.py`) follows this pattern:

```python
#!/usr/bin/env python3
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / "aide-frame" / "python"))

from aide_frame import paths, config, http_routes, HttpServer

paths.init(SCRIPT_DIR)

# Load config
cfg = config.load_config(SCRIPT_DIR / "config.json", {"port": 8080})

# Create server with PWA support
server = HttpServer(
    port=cfg.get("port", 8080),
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(
        app_name="My App",
        pwa=http_routes.PWAConfig(**cfg["pwa"]) if cfg.get("pwa", {}).get("enabled") else None,
    ),
)

# Add custom routes...

server.run()
```
