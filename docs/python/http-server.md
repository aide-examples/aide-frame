# HTTP Server

The `http_server` module provides a simple HTTP server infrastructure for aide-frame applications.

## Overview

```python
from aide_frame.http_server import HttpServer, JsonHandler

class MyHandler(JsonHandler):
    def get(self, path, params):
        if path == '/': return self.file('index.html')
        if path == '/api/status': return {'ok': True}
        return {'error': 'Not found'}, 404

    def post(self, path, data):
        if path == '/api/echo': return data
        return {'error': 'Not found'}, 404

server = HttpServer(port=8080, handler_class=MyHandler, app_dir=SCRIPT_DIR)
server.run()
```

## JsonHandler

Base class for HTTP request handlers with convenience methods.

### Response Methods

| Method | Description |
|--------|-------------|
| `send_json(data, status=200)` | Send JSON response |
| `send_html(content, status=200)` | Send HTML response |
| `send_text(content, content_type, status=200)` | Send text with any MIME type |
| `send_file(filepath, content_type=None, binary=False)` | Send file (MIME type auto-detected) |
| `file(filename)` | Serve file from `static/` directory |

### Return-Based Responses

The `get()` and `post()` methods support various return types:

```python
def get(self, path, params):
    # Dict → JSON
    return {'status': 'ok'}

    # String → HTML
    return '<h1>Hello</h1>'

    # Tuple → Response with status code
    return {'error': 'Not found'}, 404

    # None → Already handled (e.g., via self.file())
    return self.file('index.html')
```

### Docs/Help Integration

If `docs_config` is set, `/about`, `/help` and their associated APIs are automatically handled:

```python
class MyHandler(JsonHandler):
    def get(self, path, params):
        # Docs/Help are automatically checked before get()
        if path == '/': return self.file('index.html')
```

## HttpServer

Manages the server lifecycle with start/stop and signal handling.

### Constructor

```python
server = HttpServer(
    port=8080,                    # Port to listen on
    handler_class=MyHandler,      # Handler class (JsonHandler subclass)
    app_dir=SCRIPT_DIR,           # App directory (for paths.init)
    static_dir=None,              # Static files directory (default: app_dir/static)
    docs_config=None,             # DocsConfig for /about and /help
    update_config=None,           # UpdateConfig for remote updates
)
```

### Update Integration

With `update_config`, update routes and an update page are automatically provided:

```python
from aide_frame import update_routes

server = HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    update_config=update_routes.UpdateConfig(
        github_repo="username/repo",
        service_name="myapp"        # For systemctl restart
    ),
)
```

See [Update Routes](update-routes.md) for details.

### Methods

| Method | Description |
|--------|-------------|
| `start()` | Start server in background thread |
| `stop()` | Stop server |
| `run()` | Start server and block until Ctrl+C |

### Blocking vs Non-Blocking

```python
# Blocking (for simple apps)
server = HttpServer(port=8080, handler_class=MyHandler)
server.run()  # Blocks, handles Ctrl+C

# Non-Blocking (for more complex apps)
server = HttpServer(port=8080, handler_class=MyHandler)
server.start()
# ... other initialization ...
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    server.stop()
```

## Complete Example

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
from aide_frame import http_routes, http_server
from aide_frame.log import logger

# Handler
class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/':
            return self.file('index.html')
        if path == '/api/status':
            return {'ready': True}
        return {'error': 'Not found'}, 404

    def post(self, path, data):
        if path == '/api/process':
            # Process data...
            return {'success': True, 'result': data}
        return {'error': 'Not found'}, 404

# Main
def main():
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

## See Also

- [HTTP Routes](http-routes.md) - DocsConfig and docs/help routes
- [Update Routes](update-routes.md) - Remote update system
- [Widgets](widgets.md) - JavaScript widgets (Header, Status)
- [Paths](paths.md) - Path management
