# AIDE Frame (Python)

Python implementation of [AIDE Frame](../spec/README.md).

## Modules

**Core** (with spec):
[Logging](logging.md) ·
[Paths](paths.md) ·
[Config](config.md) ·
[Platform Detection](platform-detect.md) ·
[Remote Updates](update.md)

**HTTP** (Python only):
[HTTP Server](http-server.md) ·
[HTTP Routes](http-routes.md) ·
[Update Routes](update-routes.md) ·
[Widgets](widgets.md) ·
[Docs Viewer](docs-viewer.md)

**Guides**:
[Getting Started](getting-started.md) ·
[Architecture](architecture.md)

## Quick Start

```python
#!/usr/bin/env python3
import os, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(SCRIPT_DIR), 'aide-frame', 'python'))

from aide_frame import paths
paths.init(SCRIPT_DIR)

from aide_frame import http_routes, http_server
from aide_frame.log import set_level

class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/':
            return self.file('index.html')
        return {'error': 'Not found'}, 404

set_level('INFO')
http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
).run()
```

See [Getting Started](getting-started.md) for details.
