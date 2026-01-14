# Update-Routen

Das `update_routes` Modul stellt HTTP-Routen und UI für Remote-Updates bereit.

## Übersicht

```python
from aide_frame import http_server, update_routes

server = http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    update_config=update_routes.UpdateConfig(
        github_repo="username/repo",
        service_name="myapp"
    ),
)
```

## UpdateConfig

Konfiguration für das Update-System.

```python
update_routes.UpdateConfig(
    github_repo="username/repo",  # GitHub Repository (erforderlich)
    version_file="VERSION",       # Datei mit Versionsnummer
    service_name="myapp",         # Service-Name für systemctl restart
    use_releases=True,            # GitHub Releases nutzen
    branch="main",                # Branch (wenn use_releases=False)
    show_memory=True,             # Speicherverbrauch in Status anzeigen
    show_restart=True,            # Restart-Button anzeigen
)
```

## Bereitgestellte Routen

| Route | Methode | Beschreibung |
|-------|---------|--------------|
| `/update` | GET | Update-Management-Seite (HTML) |
| `/api/update/status` | GET | Aktueller Status (JSON) |
| `/api/update/check` | POST | Auf Updates prüfen |
| `/api/update/download` | POST | Update herunterladen |
| `/api/update/apply` | POST | Update anwenden und neu starten |
| `/api/update/rollback` | POST | Zur vorherigen Version zurück |
| `/api/update/enable` | POST | Updates nach Fehlern wieder aktivieren |
| `/api/restart` | POST | Server neu starten |

## Status-API Response

```json
{
  "current_version": "1.2.0",
  "available_version": "1.3.0",
  "update_available": true,
  "version_comparison": "update_available",
  "update_state": "idle",
  "platform": "wsl2",
  "memory": {
    "used_mb": 23.5,
    "total_mb": 5799
  },
  "can_rollback": false
}
```

### version_comparison Werte

| Wert | Bedeutung |
|------|-----------|
| `update_available` | Neuere Version verfügbar |
| `up_to_date` | Aktuell |
| `local_ahead` | Lokale Version ist neuer (Entwicklung) |
| `unknown` | Noch nicht geprüft |

## Update-Seite

Die Route `/update` liefert eine vollständige HTML-Seite mit:

- Versions-Anzeige (aktuell/verfügbar)
- Status-Badge (Up to Date, Update Available, etc.)
- Buttons: Check, Download, Install, Rollback
- Update-Source-Info (Repository, Branch)

## Integration mit StatusWidget

Das StatusWidget kann die Update-API nutzen:

```html
<div id="status-widget"></div>
<script src="/static/frame/js/status-widget.js"></script>
<script>
    StatusWidget.init('#status-widget');
</script>
```

Siehe [Widgets](widgets.md) für Details.

## Beispiel

```python
#!/usr/bin/env python3
from aide_frame import http_server, http_routes, update_routes

class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/':
            return self.file('index.html')
        return {'error': 'Not found'}, 404

server = http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
    update_config=update_routes.UpdateConfig(
        github_repo="username/myapp",
        service_name="myapp"
    ),
)
server.run()
```

## Siehe auch

- [HTTP Server](http-server.md) - Server-Konfiguration
- [Widgets](widgets.md) - StatusWidget und HeaderWidget
- [Update](update.md) - Update-Manager Details
