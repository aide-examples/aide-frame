# aide-frame

A lightweight application framework for Python projects, especially suited for Raspberry Pi deployments.

## Features

- **Configuration**: JSON-based config with defaults and search paths
- **Logging**: Configurable logging with color support
- **Path Management**: Centralized path handling and static file serving
- **Platform Detection**: Auto-detect Raspberry Pi, WSL, Linux, macOS
- **Remote Updates**: GitHub-based update mechanism
- **Web Requests**: Simple HTTP client for server-side API calls

## Structure

```
aide-frame/
├── spec/           # Language-agnostic specification
└── python/         # Python implementation
    └── aide_frame/
        ├── __init__.py
        ├── config.py
        ├── log.py
        ├── paths.py
        ├── platform_detect.py
        ├── update.py
        ├── web_request.py
        └── docs/
```

## Usage

### As Git Submodule (recommended for development)

```bash
cd your-project
git submodule add https://github.com/aide-examples/aide-frame.git aide-frame
```

In your Python code:

```python
import sys
import os

# Add aide-frame to path
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(PROJECT_DIR, 'aide-frame', 'python'))

# Now import modules
from aide_frame import paths, log, config
from aide_frame.log import logger

# Initialize
paths.init(__file__)
cfg = config.load_config('config.json', defaults={'port': 8080})
logger.info("Application started")
```

### For Production Deployment

Copy `python/aide_frame/` into your application's directory structure.
This ensures the deployment package is self-contained without Git dependencies.

## Modules

### config
Load JSON configuration with defaults and multiple search paths.

### log
Application logging with DEBUG/INFO/WARNING/ERROR levels and optional colors.

### paths
Manage application paths, register custom paths, serve static files.

### platform_detect
Detect runtime platform: `raspi`, `wsl2`, `linux`, `macos`, `windows`.

### update
Check for and apply updates from GitHub releases.

### web_request
Make HTTP requests from server-side code.

## License

MIT
