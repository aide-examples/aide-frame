# Getting Started

Anleitung zum Erstellen einer neuen aide-frame Anwendung.

## Projekt-Struktur

```
my-app/
├── aide-frame/              # Git-Submodul
│   └── python/
│       └── aide_frame/
├── app/
│   ├── main.py              # Haupt-Einstiegspunkt
│   ├── static/
│   │   └── index.html       # Web-UI
│   ├── docs/                # Dokumentation (optional)
│   │   └── index.md
│   ├── help/                # User-Help (optional)
│   │   └── index.md
│   ├── sample_config.json   # Konfig-Vorlage (im Repo)
│   └── config.json          # User-Konfig (in .gitignore)
└── .gitignore
```

## Kanonische Initialisierungsreihenfolge

**Wichtig:** Diese Reihenfolge muss in jeder aide-frame App eingehalten werden!

```python
#!/usr/bin/env python3
"""My App - Beschreibung."""

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

### Warum diese Reihenfolge?

1. **PATH SETUP** muss zuerst erfolgen, damit Python aide-frame finden kann
2. **paths.init()** registriert APP_DIR und ermöglicht Auto-Registrierung von docs/help
3. **Andere aide-frame Imports** können dann sicher erfolgen, z.B. `DocsConfig` nutzt paths
4. **App-spezifische Imports** kommen zuletzt

## Minimale App (hello-style)

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

Erstelle `app/static/index.html`:

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

aide-frame stellt `base.css` unter `/static/frame/css/base.css` bereit.

## Dokumentation hinzufügen

Erstelle `app/docs/index.md`:

```markdown
# My App

Kurze Beschreibung der App.

## Features

- Feature 1
- Feature 2
```

Die Dokumentation ist dann unter `/about` erreichbar.

## User-Help hinzufügen

Erstelle `app/help/index.md`:

```markdown
# My App - Hilfe

Willkommen! Diese Seite erklärt die Benutzung.

## Erste Schritte

1. Schritt eins
2. Schritt zwei
```

Die Hilfe ist dann unter `/help` erreichbar.

## Konfiguration

Erstelle `app/sample_config.json` (wird im Repo getrackt):

```json
{
    "_comment": "Copy this file to config.json and customize",
    "port": 8080,
    "log_level": "INFO"
}
```

Füge zu `.gitignore` hinzu:

```
# User config (not tracked)
app/config.json
```

Laden in der App:

```python
from aide_frame.config import load_config

config_path = os.path.join(SCRIPT_DIR, 'config.json')
config = load_config(config_path, defaults={'port': 8080})
```

Siehe [Config](config.md) für Details zum Sample Config Pattern.

## aide-frame als Submodul

```bash
git submodule add ../aide-frame aide-frame
git submodule update --init
```

Update auf neueste Version:

```bash
git submodule update --remote aide-frame
git add aide-frame
git commit -m "Update aide-frame"
```

## Nächste Schritte

- [HTTP Server](http-server.md) - JsonHandler und HttpServer Details
- [HTTP Routes](http-routes.md) - DocsConfig und Viewer-API
- [Paths](paths.md) - Pfad-Management
- [Config](config.md) - Konfigurationsdateien
- [Logging](logging.md) - Logger-Nutzung
