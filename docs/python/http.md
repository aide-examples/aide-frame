# HTTP Components (Python)

**Modules:** `http_server.py`, `http_routes.py`, `update_routes.py`, `docs_viewer.py` | [Spec](../spec/http.md)

## HttpServer & JsonHandler

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

HttpServer(port=8080, handler_class=MyHandler, app_dir=SCRIPT_DIR).run()
```

### JsonHandler Methods

- `file(filename)` - Serve file from `static/`
- `send_json(data, status=200)` - Send JSON response
- `send_html(content, status=200)` - Send HTML response
- `send_file(filepath, content_type=None)` - Send file

### Return Types

```python
return {'status': 'ok'}           # Dict → JSON
return '<h1>Hello</h1>'           # String → HTML
return {'error': 'x'}, 404        # Tuple → with status code
return self.file('index.html')    # None → already handled
```

## Configuration

```python
from aide_frame import http_routes, update_routes

HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
    update_config=update_routes.UpdateConfig(
        github_repo="username/repo",
        service_name="myapp"
    ),
).run()
```

See [Spec](../spec/http.md) for configuration options and routes.

## Implementation Details

- Based on Python's `http.server` module
- `JsonHandler` extends `BaseHTTPRequestHandler`
- Server runs in background thread (`start()`) or blocking (`run()`)
- Signal handling for graceful shutdown (Ctrl+C)
