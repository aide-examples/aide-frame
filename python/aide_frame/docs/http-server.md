# HTTP Server

Das `http_server` Modul bietet eine einfache HTTP-Server-Infrastruktur für aide-frame Anwendungen.

## Übersicht

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

Basis-Klasse für HTTP-Request-Handler mit Convenience-Methoden.

### Response-Methoden

| Methode | Beschreibung |
|---------|-------------|
| `send_json(data, status=200)` | JSON-Response senden |
| `send_html(content, status=200)` | HTML-Response senden |
| `send_text(content, content_type, status=200)` | Text mit beliebigem MIME-Type |
| `send_file(filepath, content_type=None, binary=False)` | Datei senden (MIME-Type auto-detect) |
| `file(filename)` | Datei aus `static/` Verzeichnis servieren |

### Return-basierte Responses

Die `get()` und `post()` Methoden unterstützen verschiedene Return-Typen:

```python
def get(self, path, params):
    # Dict → JSON
    return {'status': 'ok'}

    # String → HTML
    return '<h1>Hello</h1>'

    # Tuple → Response mit Status-Code
    return {'error': 'Not found'}, 404

    # None → Bereits behandelt (z.B. via self.file())
    return self.file('index.html')
```

### Docs/Help Integration

Wenn `docs_config` gesetzt ist, werden `/about`, `/help` und die zugehörigen APIs automatisch behandelt:

```python
class MyHandler(JsonHandler):
    def get(self, path, params):
        # Docs/Help werden automatisch vor get() geprüft
        if path == '/': return self.file('index.html')
```

## HttpServer

Verwaltet den Server-Lifecycle mit Start/Stop und Signal-Handling.

### Konstruktor

```python
server = HttpServer(
    port=8080,                    # Port zum Lauschen
    handler_class=MyHandler,      # Handler-Klasse (JsonHandler-Subklasse)
    app_dir=SCRIPT_DIR,           # App-Verzeichnis (für paths.init)
    static_dir=None,              # Static-Files Verzeichnis (default: app_dir/static)
    docs_config=None,             # DocsConfig für /about und /help
)
```

### Methoden

| Methode | Beschreibung |
|---------|-------------|
| `start()` | Server im Hintergrund-Thread starten |
| `stop()` | Server stoppen |
| `run()` | Server starten und blockieren bis Ctrl+C |

### Blocking vs Non-Blocking

```python
# Blocking (für einfache Apps)
server = HttpServer(port=8080, handler_class=MyHandler)
server.run()  # Blockiert, handled Ctrl+C

# Non-Blocking (für komplexere Apps)
server = HttpServer(port=8080, handler_class=MyHandler)
server.start()
# ... andere Initialisierung ...
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    server.stop()
```

## Vollständiges Beispiel

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
            # Verarbeite data...
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

## Siehe auch

- [HTTP Routes](http-routes.md) - DocsConfig und Docs/Help-Routen
- [Paths](paths.md) - Pfad-Management
