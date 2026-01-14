# JavaScript Widgets

aide-frame stellt wiederverwendbare JavaScript-Widgets für Web-UIs bereit.

## Verfügbare Widgets

| Widget | Datei | Beschreibung |
|--------|-------|--------------|
| HeaderWidget | `header-widget.js` | Standardisierte Kopfzeile |
| StatusWidget | `status-widget.js` | System-Status mit Update-Info |

## Einbindung

Die Widgets werden über `/static/frame/js/` bereitgestellt:

```html
<script src="/static/frame/js/header-widget.js"></script>
<script src="/static/frame/js/status-widget.js"></script>
```

---

## HeaderWidget

Einheitliche Kopfzeile für alle Seiten: App-Name links, About und Help-Link rechts.

### Verwendung

```html
<div id="app-header"></div>

<script src="/static/frame/js/header-widget.js"></script>
<script>
    HeaderWidget.init('#app-header', {
        appName: 'My Application'
    });
</script>
```

### Optionen

| Option | Default | Beschreibung |
|--------|---------|--------------|
| `appName` | `'AIDE App'` | Angezeigter App-Name |
| `showAbout` | `true` | About-Link anzeigen |
| `showHelp` | `true` | Help-Link (?) anzeigen |
| `aboutLink` | `'/about'` | URL für About |
| `helpLink` | `'/help'` | URL für Help |
| `aboutText` | `'About'` | Text des About-Links |

### Beispiel mit allen Optionen

```javascript
HeaderWidget.init('#app-header', {
    appName: 'AIDE Slideshow',
    showAbout: true,
    showHelp: true,
    aboutLink: '/about',
    helpLink: '/help',
    aboutText: 'Docs'
});
```

### Generiertes HTML

```html
<div class="header">
    <h1>My Application</h1>
    <div style="display: flex; gap: 12px;">
        <a href="/about" class="header-link">About</a>
        <a href="/help" class="header-link" title="Help" style="font-weight: bold;">?</a>
    </div>
</div>
```

---

## StatusWidget

Kompakte System-Status-Anzeige mit:
- Plattform (raspi, wsl2, linux, etc.)
- Speicherverbrauch (used of total MB)
- Version mit Update-Hinweis
- Update- und Restart-Buttons

### Verwendung

```html
<div id="status-widget"></div>

<script src="/static/frame/js/status-widget.js"></script>
<script>
    StatusWidget.init('#status-widget');
</script>
```

### Optionen

| Option | Default | Beschreibung |
|--------|---------|--------------|
| `showRestart` | `true` | Restart-Button anzeigen |
| `refreshInterval` | `30000` | Auto-Refresh in ms (0 = aus) |

### Beispiel

```javascript
StatusWidget.init('#status-widget', {
    showRestart: true,
    refreshInterval: 30000
});
```

### API-Anforderung

Das Widget ruft `/api/update/status` auf und erwartet:

```json
{
  "current_version": "1.2.0",
  "update_available": true,
  "platform": "wsl2",
  "memory": {
    "used_mb": 23.5,
    "total_mb": 5799
  }
}
```

### Generiertes HTML

```html
<div class="card">
    <div class="status-row">
        <span class="status-label">System</span>
        <span class="status-value" id="sw-info">wsl2 · 23.5 of 5799 MB</span>
    </div>
    <div class="status-row">
        <span id="sw-version">v1.2.0</span>
        <span id="sw-update-hint">new!</span>
        <span style="flex: 1;"></span>
        <button class="secondary">Update</button>
        <button class="secondary">Restart</button>
    </div>
</div>
```

---

## Voraussetzungen

Die Widgets setzen voraus:

1. **CSS**: `/static/frame/css/base.css` für Styling
2. **Server**: `update_config` für StatusWidget-API

### Vollständiges Beispiel

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/static/frame/css/base.css">
</head>
<body>
    <div class="container">
        <div id="app-header"></div>

        <!-- App-Inhalt -->

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

## Siehe auch

- [HTTP Server](http-server.md) - Server mit update_config
- [Update-Routen](update-routes.md) - API für StatusWidget
