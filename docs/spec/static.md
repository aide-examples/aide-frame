# Static Assets (Spec)

Frontend assets shared across all aide-frame implementations: CSS, JavaScript widgets, templates, and i18n.

## Overview

aide-frame provides a complete frontend toolkit for web-based applications:

- **CSS Framework** - Base styles and docs viewer styles
- **JavaScript Widgets** - HeaderWidget, StatusWidget
- **i18n System** - Polyglot.js-based internationalization
- **Templates** - HTML templates for docs viewer and update page
- **Vendor Libraries** - marked.js (Markdown), polyglot.js (i18n)

All static assets are served via `/static/frame/`.

## Directory Structure

```
static/
├── css/
│   ├── base.css           # Base UI framework
│   └── docs-viewer.css    # Docs/help viewer styles
├── js/
│   ├── header-widget.js   # HeaderWidget
│   ├── status-widget.js   # StatusWidget
│   ├── i18n.js            # I18n manager
│   └── google-translate.js # Google Translate integration
├── templates/
│   └── viewer.html        # Docs/help viewer template
├── update/
│   ├── update.html        # Update management page
│   └── update.js          # Update UI logic
├── locales/
│   ├── en.json            # English strings
│   ├── de.json            # German strings
│   └── es.json            # Spanish strings
└── vendor/
    ├── marked/marked.min.js     # Markdown parser
    └── polyglot/polyglot.min.js # i18n library
```

---

## CSS Framework

### base.css

Reusable UI components for aide-frame applications.

| Component | Classes | Description |
|-----------|---------|-------------|
| Container | `.container`, `.wide`, `.full` | Responsive content wrapper |
| Header | `.header`, `.sticky` | App header with navigation |
| Cards | `.card` | Content cards with shadow |
| Buttons | `button`, `.secondary`, `.danger`, `.wide` | Styled buttons |
| Forms | `.form-group`, `.form-row`, `.checkbox-group` | Form elements |
| Status | `.status-row`, `.status-badge` | Status displays |
| Messages | `.message.info/success/warning/error` | Alert messages |
| Progress | `.progress-bar-container`, `.progress-bar` | Progress bars |
| Stats | `.progress-stats`, `.stat-box` | Statistics grid |
| Footer | `.status-footer`, `.status-footer-btn` | Compact status footer |

### docs-viewer.css

Styles for the documentation and help viewer.

| Component | Classes | Description |
|-----------|---------|-------------|
| Layout | `.docs-layout`, `.help-layout` | Two-column layout |
| Sidebar | `.docs-sidebar`, `.help-nav` | Navigation sidebar |
| Content | `.docs-content`, `.help-content`, `.markdown-body` | Main content area |
| TOC | `.toc-container`, `.toc-header`, `.toc-content` | Table of contents |
| Breadcrumb | `.breadcrumb` | Navigation breadcrumb |
| Mermaid | `.mermaid` | Mermaid diagram container |

---

## JavaScript Widgets

### HeaderWidget

Standard application header with app name, language selector, and navigation links.

```javascript
HeaderWidget.init('#container', {
    appName: 'My App',
    showAbout: true,
    showHelp: true,
    showLanguage: true,
    showGoogleTranslate: false,
    aboutLink: '/about',
    helpLink: '/help',
    aboutText: 'About'
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appName` | string | "AIDE App" | Application name |
| `showAbout` | bool | true | Show "About" link |
| `showHelp` | bool | true | Show "?" help link |
| `showLanguage` | bool | true | Show language selector |
| `showGoogleTranslate` | bool | false | Show Google Translate widget |
| `aboutLink` | string | "/about" | About page URL |
| `helpLink` | string | "/help" | Help page URL |
| `aboutText` | string | "About" | About link text |

### StatusWidget

Compact footer displaying version, platform, memory, and action buttons.

```javascript
StatusWidget.init('#container', {
    showRestart: true,
    showUpdate: true,
    refreshInterval: 30000
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showRestart` | bool | true | Show restart button |
| `showUpdate` | bool | true | Show update link |
| `refreshInterval` | int | 30000 | Status refresh interval (ms), 0 to disable |

Requires `/api/update/status` endpoint (see [HTTP Spec](http.md)).

---

## Internationalization (i18n)

### I18n Manager

Wrapper around Polyglot.js for translations with pluralization support.

```javascript
// Initialize (auto-detects language)
await i18n.init();

// Or force language
await i18n.init('de');

// Translate
i18n.t('loading');                        // → "Loading..."
i18n.t('doc_not_found', {path: 'x.md'});  // → "Document not found: x.md"

// Apply to DOM elements with data-i18n attribute
i18n.applyToDOM();

// Change language (reloads page)
i18n.setLanguage('de');
```

### Language Detection

Priority order:
1. URL parameter: `?lang=de`
2. localStorage: `lang` key
3. Browser language: `navigator.language`
4. Default: `en`

### Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `de` | German |
| `es` | Spanish |

### String Loading

Strings are loaded from two sources and merged:

1. **Framework strings**: `/static/frame/locales/{lang}.json`
2. **App strings**: `/static/locales/{lang}.json` (override framework)

### DOM Integration

```html
<span data-i18n="loading">Loading...</span>
<span data-i18n="items" data-i18n-params='{"smart_count": 5}'>5 items</span>
```

Call `i18n.applyToDOM()` to translate all elements with `data-i18n` attribute.

### Google Translate Integration

Optional Google Translate widget for additional languages.

```javascript
// Initialize in a container
GoogleTranslate.init('#gt-container');
```

Elements with class `notranslate` are excluded from Google Translate.

---

## Templates

### viewer.html

Single-page documentation/help viewer with:

- Sidebar navigation (auto-generated from `/api/viewer/structure`)
- Markdown rendering (marked.js)
- Mermaid diagram support
- Table of contents generation
- Breadcrumb navigation
- Internal `.md` link interception
- Image URL rewriting
- i18n support
- Google Translate integration

Served at `/about` (docs) and `/help` (help).

### update.html

Web UI for the [Remote Updates](update.md) system:

- Version information display
- Update check, download, apply buttons
- Rollback functionality
- Status messages
- i18n support

Calls the update API endpoints defined in [HTTP Spec](http.md#update-management).

Served at `/update`.

---

## Vendor Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| marked.js | 9.x | Markdown to HTML parsing |
| polyglot.js | 2.x | i18n with pluralization |

External (CDN):
- mermaid.js - Diagram rendering (loaded on demand)

---

## Serving Static Assets

Static assets are served via the HTTP server:

| Route | Source |
|-------|--------|
| `/static/frame/{path}` | Framework static files |
| `/static/{path}` | Application static files |

Framework static files are served from the `static/` directory at the aide-frame repository root. This location is shared between all language implementations (Python, JavaScript).

## Usage in HTML

```html
<!-- CSS -->
<link rel="stylesheet" href="/static/frame/css/base.css">
<link rel="stylesheet" href="/static/frame/css/docs-viewer.css">

<!-- Vendor -->
<script src="/static/frame/vendor/marked/marked.min.js"></script>
<script src="/static/frame/vendor/polyglot/polyglot.min.js"></script>

<!-- Widgets -->
<script src="/static/frame/js/i18n.js"></script>
<script src="/static/frame/js/header-widget.js"></script>
<script src="/static/frame/js/status-widget.js"></script>

<!-- Initialize -->
<script>
    await i18n.init();
    HeaderWidget.init('#header', { appName: 'My App' });
    StatusWidget.init('#footer');
</script>
```

---

## Implementations

Static assets are language-agnostic and shared across all implementations.

| Language | Serving Module | Status |
|----------|----------------|--------|
| Python | [http.md](../python/http.md) | Available |
| JavaScript | [http.md](../js/http.md) | Available |
