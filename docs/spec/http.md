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
  "title_html": null,
  "back_link": "/",
  "back_text": "Home",
  "features": {
    "mermaid": true,
    "docs": true,
    "help": true
  },
  "viewer_hooks": "/static/app/viewer-hooks.js"
}
```

`title_html` is optional. When set (via `docsConfig.titleHtml`), it provides custom HTML for the header title area.

`viewer_hooks` is optional. When set, the viewer loads this script and calls `window.viewerContentHook(container, context)` after rendering each page. See [Content Hook](#content-hook).

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

### POST /api/viewer/content (Editing Feature)

Save modified Markdown content. Requires editing to be enabled for the root.

**Request:**
```json
{
  "root": "docs",
  "path": "requirements/index.md",
  "content": "# Updated Title\n\nNew content..."
}
```

**Response (success):**
```json
{
  "success": true
}
```

**Response (error):**
```json
{
  "error": "Editing disabled for this root"
}
```

**Error codes:**
- 400: Missing path or content
- 403: Editing disabled, framework docs, or path traversal attempt
- 404: File not found
- 500: Write error

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
| `docsEditable` | false | Enable editing for /about |
| `helpEditable` | false | Enable editing for /help |
| `viewerHooks` | null | URL to a JS file for content post-processing |

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
- Optional content hook for app-specific post-processing

### Content Hook

When `viewerHooks` is set in DocsConfig, the viewer dynamically loads the specified script at startup. After rendering each page, it calls:

```javascript
await window.viewerContentHook(container, {
    docPath,      // current document path (e.g., "requirements/classes/Aircraft.md")
    viewerRoot,   // root name ("docs", "help", or custom)
    docNames      // [{name, path}] — all document names, sorted by name length desc
});
```

The hook function may be synchronous or async. `docNames` contains base filenames (without `.md`) mapped to their full viewer paths, enabling cross-reference linkification or other DOM transformations.

**Example** (in app's DocsConfig):
```javascript
docsConfig: {
    viewerHooks: '/static/app/viewer-hooks.js'
}
```

### Online Editing (Optional)

When editing is enabled for a root (`docsEditable` or `helpEditable`):

- Right-click on any heading opens a section editor
- Section = heading + all content until next heading of same/higher level
- MediaWiki-style: edit individual sections, not entire documents
- Editor provides CSS-based Markdown syntax highlighting
- After save, view scrolls to the edited heading

**Usage:**
1. Set `docsEditable: true` in app config
2. Right-click any H1-H6 heading in the rendered document
3. Edit the Markdown in the modal
4. Click "Save" to persist changes

**Limitations:**
- Framework docs (`framework/` prefix) are always read-only
- No concurrent edit detection
- No backup before save (consider version control)

### Security

- Path traversal blocked in all file operations
- Paths restricted to configured directories
- Editing only possible when explicitly enabled per root
- Framework documentation always protected

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [http.md](../python/http.md) | Available |
| JavaScript | [http.md](../js/http.md) | Available |
