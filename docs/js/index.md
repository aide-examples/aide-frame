# AIDE Frame - Node.js Implementation

Node.js implementation of the aide-frame application framework.

## Installation

```bash
# From npm (when published)
npm install aide-frame

# Or link directly from submodule
npm install file:aide-frame/js/aide_frame
```

## Quick Start

```javascript
const { HttpServer, paths, config } = require('aide-frame');

// Initialize paths
paths.init(__dirname);

// Load configuration
const cfg = config.loadConfig('config.json', { port: 8080 });

// Create server
const server = new HttpServer({
    port: cfg.port,
    appDir: __dirname,
    docsConfig: { appName: 'My App' }
});

// Add routes
server.addRoutes((app) => {
    app.get('/', (req, res) => {
        res.sendFile('index.html', { root: paths.STATIC_DIR });
    });

    app.get('/api/status', (req, res) => {
        res.json({ status: 'ok' });
    });
});

// Start server
server.run();
```

## Modules

| Module | Description |
|--------|-------------|
| [paths](paths.md) | Central path management |
| [config](config.md) | JSON configuration loading |
| [http](http.md) | HTTP server and routes |
| [update](update.md) | Remote update system |

## Requirements

- Node.js 18+ (for native `fetch()`)
- Express 4.x

## Module Overview

### Core Modules

```javascript
const {
    paths,      // Path management
    config,     // Configuration loading
    log,        // Logging
    platformDetect  // Platform detection
} = require('aide-frame');
```

### HTTP Modules

```javascript
const {
    HttpServer,   // Express server wrapper
    httpRoutes,   // Docs/help routes
    docsViewer    // Markdown viewer
} = require('aide-frame');
```

### Update Modules

```javascript
const {
    update,        // Update manager
    updateRoutes,  // Update API routes
    webRequest     // HTTP client
} = require('aide-frame');
```

### Utilities

```javascript
const {
    args,          // CLI argument parsing
    qrcodeUtils    // QR code generation
} = require('aide-frame');
```

## Comparison with Python

| Feature | Python | Node.js |
|---------|--------|---------|
| HTTP Server | `http.server` (stdlib) | Express |
| CLI Args | `argparse` | Commander |
| QR Codes | `qrcode` | `qrcode` npm |
| Async | Threads | Promises/async-await |
| Package Manager | pip | npm |

## Static Assets

Static assets are shared between Python and Node.js implementations.
They are located at `aide-frame/static/` and served at `/static/frame/`.

See [Static Assets Spec](../spec/static.md) for details.
