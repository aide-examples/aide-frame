# HTTP Routes

Das `http_routes` Modul stellt wiederverwendbare Route-Handler für Dokumentation und Help bereit.

## Übersicht

```python
from aide_frame import http_routes

config = http_routes.DocsConfig(
    app_name="My App",
    back_link="/",
    back_text="Home",
)

# Im HTTP-Handler:
if http_routes.handle_request(self, self.path, config):
    return  # Route wurde behandelt
```

## DocsConfig

Konfiguration für die Docs/Help-Routen.

### Parameter

| Parameter | Default | Beschreibung |
|-----------|---------|-------------|
| `app_name` | "AIDE App" | App-Name für Titel |
| `back_link` | "/" | Zurück-Link URL |
| `back_text` | "Back" | Zurück-Link Text |
| `docs_dir_key` | "DOCS_DIR" | paths.py Key für docs/ |
| `help_dir_key` | "HELP_DIR" | paths.py Key für help/ |
| `framework_dir_key` | None | Key für Framework-Docs |
| `section_defs` | None | Manuelle Section-Definitionen |
| `enable_docs` | True | /about aktivieren |
| `enable_help` | True | /help aktivieren |
| `enable_mermaid` | True | Mermaid-Diagramme aktivieren |

### Auto-Registrierung

`DocsConfig` registriert automatisch Standard-Pfade, wenn sie existieren:

```python
# Wenn app/docs/ existiert → paths.register("DOCS_DIR", "app/docs/")
# Wenn app/help/ existiert → paths.register("HELP_DIR", "app/help/")
```

**Wichtig:** `paths.init(SCRIPT_DIR)` muss **vor** der DocsConfig-Erstellung aufgerufen werden!

## handle_request()

Prüft ob ein Request zu Docs/Help gehört und behandelt ihn.

```python
def handle_request(handler, path, config) -> bool:
    """
    Args:
        handler: HTTP-Handler mit send_response, send_header, etc.
        path: Request-Pfad inkl. Query-String (z.B. self.path)
        config: DocsConfig-Instanz

    Returns:
        True wenn behandelt, False für Weiterleitung an andere Handler
    """
```

**Wichtig:** Immer `self.path` (mit Query-String) übergeben, nicht nur den Pfad!

## Routen

### HTML-Seiten

| Route | Beschreibung |
|-------|-------------|
| `/about` | Dokumentations-Viewer |
| `/help` | Help-Viewer |

### Unified Viewer API

| Route | Beschreibung |
|-------|-------------|
| `/api/viewer/structure?root=docs` | Docs-Struktur mit Sections |
| `/api/viewer/structure?root=help` | Help-Struktur (flach) |
| `/api/viewer/content?root=docs&path=file.md` | Docs-Inhalt laden |
| `/api/viewer/content?root=help&path=file.md` | Help-Inhalt laden |

### App-Konfiguration

| Route | Beschreibung |
|-------|-------------|
| `/api/app/config` | App-Name, Features, Back-Link |

### Assets

| Route | Beschreibung |
|-------|-------------|
| `/docs-assets/{path}` | Bilder aus docs/ |
| `/help-assets/{path}` | Bilder aus help/ |
| `/static/frame/{path}` | aide-frame Static Files (CSS, JS) |

### Legacy APIs (Kompatibilität)

| Route | Beschreibung |
|-------|-------------|
| `/api/docs/structure` | Alte Docs-API |
| `/api/docs/{path}` | Alte Docs-Content-API |
| `/api/help/structure` | Alte Help-API |
| `/api/help/{path}` | Alte Help-Content-API |

## API Response-Formate

### /api/viewer/structure

```json
{
  "sections": [
    {
      "name": "Overview",
      "docs": [
        {
          "path": "index.md",
          "title": "Projekt Name",
          "description": "Kurzbeschreibung des Projekts."
        }
      ]
    },
    {
      "name": "Requirements",
      "docs": [...]
    }
  ]
}
```

### /api/viewer/content

```json
{
  "content": "# Titel\n\nMarkdown-Inhalt...",
  "path": "index.md",
  "framework": false
}
```

### /api/app/config

```json
{
  "app_name": "My App",
  "back_link": "/",
  "back_text": "Home",
  "features": {
    "mermaid": true,
    "docs": true,
    "help": true
  }
}
```

## Docs-Verzeichnis-Struktur

```
app/docs/
├── index.md                    # → Section "Overview"
├── requirements/
│   └── index.md               # → Section "Requirements"
├── platform/
│   └── index.md               # → Section "Platform"
├── implementation/
│   └── index.md               # → Section "Implementation"
├── deployment/
│   └── index.md               # → Section "Deployment"
└── development/
    └── index.md               # → Section "Development"
```

Sections werden automatisch aus der Verzeichnisstruktur erkannt.

## Help-Verzeichnis-Struktur

```
app/help/
├── index.md                    # Hauptseite
├── getting-started.md          # Weitere Seiten
└── faq.md
```

Help hat eine flache Struktur (keine Sections).

## Title und Description

Aus jeder Markdown-Datei werden automatisch extrahiert:

```markdown
# Mein Titel

Dies ist die erste Zeile, die als Description verwendet wird.
Weitere Absätze folgen...
```

- **Title**: Erste H1-Überschrift
- **Description**: Erster Satz nach dem Titel

## Siehe auch

- [HTTP Server](http-server.md) - HttpServer und JsonHandler
- [Docs Viewer](docs-viewer.md) - Frontend-Architektur
