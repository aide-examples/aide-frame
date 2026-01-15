# JavaScript Widgets (Python)

aide-frame provides reusable JavaScript widgets for web UIs.

## Available Widgets

| Widget | File | Description |
|--------|------|-------------|
| HeaderWidget | `header-widget.js` | Standardized header |
| StatusWidget | `status-widget.js` | System status with update info |

## Integration

The widgets are served via `/static/frame/js/`:

```html
<script src="/static/frame/js/header-widget.js"></script>
<script src="/static/frame/js/status-widget.js"></script>
```

---

## HeaderWidget

Unified header for all pages: app name on the left, About and Help links on the right.

### Usage

```html
<div id="app-header"></div>

<script src="/static/frame/js/header-widget.js"></script>
<script>
    HeaderWidget.init('#app-header', {
        appName: 'My Application'
    });
</script>
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `appName` | `'AIDE App'` | Displayed app name |
| `showAbout` | `true` | Show About link |
| `showHelp` | `true` | Show Help link (?) |
| `aboutLink` | `'/about'` | URL for About |
| `helpLink` | `'/help'` | URL for Help |
| `aboutText` | `'About'` | Text for About link |

### Example with All Options

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

### Generated HTML

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

Compact system status display with:
- Platform (raspi, wsl2, linux, etc.)
- Memory usage (used of total MB)
- Version with update hint
- Update and Restart buttons

### Usage

```html
<div id="status-widget"></div>

<script src="/static/frame/js/status-widget.js"></script>
<script>
    StatusWidget.init('#status-widget');
</script>
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `showRestart` | `true` | Show restart button |
| `refreshInterval` | `30000` | Auto-refresh in ms (0 = off) |

### Example

```javascript
StatusWidget.init('#status-widget', {
    showRestart: true,
    refreshInterval: 30000
});
```

### API Requirement

The widget calls `/api/update/status` and expects:

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

### Generated HTML

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

## Prerequisites

The widgets require:

1. **CSS**: `/static/frame/css/base.css` for styling
2. **Server**: `update_config` for StatusWidget API

### Complete Example

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/static/frame/css/base.css">
</head>
<body>
    <div class="container">
        <div id="app-header"></div>

        <!-- App content -->

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

## See Also

- [HTTP Server](http-server.md) - Server with update_config
- [Update Routes](update-routes.md) - API for StatusWidget
