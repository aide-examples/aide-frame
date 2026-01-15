# HTTP Components (Python)

**Modules:** `http_server.py`, `http_routes.py`, `update_routes.py`, `docs_viewer.py` | [Spec](../spec/http.md)

Python implementation of HTTP server, routes, docs viewer, and widgets.

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

server = HttpServer(port=8080, handler_class=MyHandler, app_dir=SCRIPT_DIR)
server.run()
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

### HttpServer Options

```python
HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    static_dir=None,          # Default: app_dir/static
    docs_config=None,         # DocsConfig for /about, /help
    update_config=None,       # UpdateConfig for remote updates
)
```

---

## DocsConfig

Configuration for `/about` (docs) and `/help` routes.

```python
from aide_frame import http_routes

docs_config = http_routes.DocsConfig(
    app_name="My App",
    back_link="/",
    back_text="Home",
    enable_docs=True,         # /about
    enable_help=True,         # /help
    enable_mermaid=True,      # Mermaid diagrams
)
```

Auto-registers `DOCS_DIR` and `HELP_DIR` if `app/docs/` and `app/help/` exist.

### Routes Provided

| Route | Description |
|-------|-------------|
| `/about` | Documentation viewer |
| `/help` | Help viewer |
| `/api/viewer/structure?root=docs` | Docs structure |
| `/api/viewer/content?root=docs&path=file.md` | Docs content |
| `/api/app/config` | App configuration |

### Directory Structure

```
app/docs/                    app/help/
├── index.md                 ├── index.md
├── requirements/            ├── getting-started.md
│   └── index.md            └── faq.md
└── implementation/
    └── index.md
```

Docs: hierarchical with auto-detected sections. Help: flat.

---

## UpdateConfig

Configuration for remote update system.

```python
from aide_frame import update_routes

update_config = update_routes.UpdateConfig(
    github_repo="username/repo",
    service_name="myapp",     # For systemctl restart
    use_releases=True,
    branch="main",
)
```

### Routes Provided

| Route | Method | Description |
|-------|--------|-------------|
| `/update` | GET | Update management page |
| `/api/update/status` | GET | Current status |
| `/api/update/check` | POST | Check for updates |
| `/api/update/download` | POST | Download update |
| `/api/update/apply` | POST | Apply and restart |
| `/api/update/rollback` | POST | Roll back |
| `/api/restart` | POST | Restart server |

---

## JavaScript Widgets

Served via `/static/frame/js/`.

### HeaderWidget

```html
<div id="app-header"></div>
<script src="/static/frame/js/header-widget.js"></script>
<script>
    HeaderWidget.init('#app-header', {
        appName: 'My App',
        showAbout: true,
        showHelp: true
    });
</script>
```

### StatusWidget

Displays platform, memory, version, update/restart buttons.

```html
<div id="status-widget"></div>
<script src="/static/frame/js/status-widget.js"></script>
<script>
    StatusWidget.init('#status-widget', {
        showRestart: true,
        refreshInterval: 30000
    });
</script>
```

Requires `update_config` on server for `/api/update/status`.

---

## Complete Example

```python
#!/usr/bin/env python3
import os, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(SCRIPT_DIR), 'aide-frame', 'python'))

from aide_frame import paths
paths.init(SCRIPT_DIR)

from aide_frame import http_routes, http_server, update_routes

class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/': return self.file('index.html')
        return {'error': 'Not found'}, 404

http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
    update_config=update_routes.UpdateConfig(
        github_repo="username/myapp",
        service_name="myapp"
    ),
).run()
```

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/static/frame/css/base.css">
</head>
<body>
    <div class="container">
        <div id="app-header"></div>
        <div class="card"><p>Hello World!</p></div>
        <div id="status-widget"></div>
    </div>
    <script src="/static/frame/js/header-widget.js"></script>
    <script src="/static/frame/js/status-widget.js"></script>
    <script>
        HeaderWidget.init('#app-header', { appName: 'My App' });
        StatusWidget.init('#status-widget');
    </script>
</body>
</html>
```
