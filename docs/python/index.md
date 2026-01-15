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
[HTTP Components](http.md)

**Guide**:
[Getting Started & Architecture](guide.md)

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

See [Guide](guide.md) for details.
