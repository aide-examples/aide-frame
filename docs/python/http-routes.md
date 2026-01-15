# HTTP Routes

The `http_routes` module provides reusable route handlers for documentation and help.

## Overview

```python
from aide_frame import http_routes

config = http_routes.DocsConfig(
    app_name="My App",
    back_link="/",
    back_text="Home",
)

# In the HTTP handler:
if http_routes.handle_request(self, self.path, config):
    return  # Route was handled
```

## DocsConfig

Configuration for docs/help routes.

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `app_name` | "AIDE App" | App name for titles |
| `back_link` | "/" | Back link URL |
| `back_text` | "Back" | Back link text |
| `docs_dir_key` | "DOCS_DIR" | paths.py key for docs/ |
| `help_dir_key` | "HELP_DIR" | paths.py key for help/ |
| `framework_dir_key` | None | Key for framework docs |
| `section_defs` | None | Manual section definitions |
| `enable_docs` | True | Enable /about |
| `enable_help` | True | Enable /help |
| `enable_mermaid` | True | Enable Mermaid diagrams |

### Auto-Registration

`DocsConfig` automatically registers default paths if they exist:

```python
# If app/docs/ exists → paths.register("DOCS_DIR", "app/docs/")
# If app/help/ exists → paths.register("HELP_DIR", "app/help/")
```

**Important:** `paths.init(SCRIPT_DIR)` must be called **before** creating DocsConfig!

## handle_request()

Checks if a request belongs to docs/help and handles it.

```python
def handle_request(handler, path, config) -> bool:
    """
    Args:
        handler: HTTP handler with send_response, send_header, etc.
        path: Request path including query string (e.g., self.path)
        config: DocsConfig instance

    Returns:
        True if handled, False to pass to other handlers
    """
```

**Important:** Always pass `self.path` (with query string), not just the path!

## Routes

### HTML Pages

| Route | Description |
|-------|-------------|
| `/about` | Documentation viewer |
| `/help` | Help viewer |

### Unified Viewer API

| Route | Description |
|-------|-------------|
| `/api/viewer/structure?root=docs` | Docs structure with sections |
| `/api/viewer/structure?root=help` | Help structure (flat) |
| `/api/viewer/content?root=docs&path=file.md` | Load docs content |
| `/api/viewer/content?root=help&path=file.md` | Load help content |

### App Configuration

| Route | Description |
|-------|-------------|
| `/api/app/config` | App name, features, back link |

### Assets

| Route | Description |
|-------|-------------|
| `/docs-assets/{path}` | Images from docs/ |
| `/help-assets/{path}` | Images from help/ |
| `/static/frame/{path}` | aide-frame static files (CSS, JS) |

### Legacy APIs (Compatibility)

| Route | Description |
|-------|-------------|
| `/api/docs/structure` | Old docs API |
| `/api/docs/{path}` | Old docs content API |
| `/api/help/structure` | Old help API |
| `/api/help/{path}` | Old help content API |

## API Response Formats

### /api/viewer/structure

```json
{
  "sections": [
    {
      "name": "Overview",
      "docs": [
        {
          "path": "index.md",
          "title": "Project Name",
          "description": "Brief description of the project."
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
  "content": "# Title\n\nMarkdown content...",
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

## Docs Directory Structure

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

Sections are automatically detected from the directory structure.

## Help Directory Structure

```
app/help/
├── index.md                    # Main page
├── getting-started.md          # Additional pages
└── faq.md
```

Help has a flat structure (no sections).

## Title and Description

Automatically extracted from each Markdown file:

```markdown
# My Title

This is the first line, used as the description.
Further paragraphs follow...
```

- **Title**: First H1 heading
- **Description**: First sentence after the title

## See Also

- [HTTP Server](http-server.md) - HttpServer and JsonHandler
- [Docs Viewer](docs-viewer.md) - Frontend architecture
