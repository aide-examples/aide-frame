# HTTP Components (Spec)

HTTP server, routes, and widgets for web-based applications.

## Overview

aide-frame applications expose a web interface with:
- Static file serving
- JSON API endpoints
- Documentation viewer (`/about`)
- Help viewer (`/help`)
- Update management (`/update`)
- JavaScript widgets

## Routes

### Static Files

| Route | Description |
|-------|-------------|
| `/static/{path}` | App static files |
| `/static/frame/{path}` | Framework static files (CSS, JS) |

### Documentation & Help

| Route | Description |
|-------|-------------|
| `/about` | Documentation viewer (HTML) |
| `/help` | Help viewer (HTML) |
| `/api/viewer/structure?root=docs` | Docs structure (JSON) |
| `/api/viewer/structure?root=help` | Help structure (JSON) |
| `/api/viewer/content?root={root}&path={file}` | Markdown content (JSON) |
| `/api/app/config` | App configuration (JSON) |
| `/docs-assets/{path}` | Images from docs/ |
| `/help-assets/{path}` | Images from help/ |

### Update Management

| Route | Method | Description |
|-------|--------|-------------|
| `/update` | GET | Update management page (HTML) |
| `/api/update/status` | GET | Current status |
| `/api/update/check` | POST | Check for updates |
| `/api/update/download` | POST | Download update |
| `/api/update/apply` | POST | Apply and restart |
| `/api/update/rollback` | POST | Roll back |
| `/api/restart` | POST | Restart server |

---

## API Responses

### GET /api/app/config

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

### GET /api/viewer/structure

```json
{
  "sections": [
    {
      "name": "Overview",
      "docs": [
        {
          "path": "index.md",
          "title": "Project Name",
          "description": "Brief description."
        }
      ]
    }
  ]
}
```

### GET /api/viewer/content

```json
{
  "content": "# Title\n\nMarkdown content...",
  "path": "index.md",
  "framework": false
}
```

### GET /api/update/status

```json
{
  "current_version": "1.2.0",
  "available_version": "1.3.0",
  "update_available": true,
  "version_comparison": "update_available",
  "update_state": "idle",
  "platform": "raspi",
  "memory": {
    "used_mb": 23.5,
    "total_mb": 1024
  },
  "can_rollback": false
}
```

### POST /api/update/check

```json
{
  "update_available": true,
  "current_version": "1.2.0",
  "available_version": "1.3.0"
}
```

---

## Configuration

### DocsConfig

| Option | Default | Description |
|--------|---------|-------------|
| `app_name` | "AIDE App" | Application name |
| `back_link` | "/" | Back button URL |
| `back_text` | "Back" | Back button text |
| `enable_docs` | true | Enable /about |
| `enable_help` | true | Enable /help |
| `enable_mermaid` | true | Enable Mermaid diagrams |

### UpdateConfig

| Option | Default | Description |
|--------|---------|-------------|
| `github_repo` | — | Repository (required) |
| `service_name` | — | Systemd service name |
| `use_releases` | true | Use GitHub Releases |
| `branch` | "main" | Branch (if not releases) |

---

## Directory Structure

### Documentation (hierarchical)

```
app/docs/
├── index.md              → Section "Overview"
├── requirements/
│   └── index.md          → Section "Requirements"
└── implementation/
    └── index.md          → Section "Implementation"
```

Sections auto-detected from subdirectories.

### Help (flat)

```
app/help/
├── index.md
├── getting-started.md
└── faq.md
```

---

## Widgets

JavaScript widgets served via `/static/frame/js/`.

### HeaderWidget

Renders app header with navigation links.

```javascript
HeaderWidget.init('#container', {
    appName: 'My App',
    showAbout: true,
    showHelp: true,
    aboutLink: '/about',
    helpLink: '/help'
});
```

### StatusWidget

Displays system status, version, update/restart buttons.

```javascript
StatusWidget.init('#container', {
    showRestart: true,
    refreshInterval: 30000
});
```

Requires `/api/update/status` endpoint.

---

## Behavior

### Static File Serving

- MIME types determined by file extension
- Path traversal (`..`) blocked
- Binary files (images) served as-is

### Documentation Viewer

- Markdown rendered client-side (marked.js)
- Mermaid diagrams supported
- Table of contents auto-generated
- Internal `.md` links intercepted

### Security

- Path traversal blocked in all file operations
- Paths restricted to configured directories

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [http.md](../python/http.md) | Available |
| JavaScript | — | Planned |
