# Start Your Own App (Node.js)

Platform-specific details for creating a Node.js aide-frame application.

See [Start Your Own App](../start-your-own-app.md) for the complete guide.

## What Gets Created

| File | Purpose |
|------|---------|
| `package.json` | Node.js dependencies |
| `run` | Startup script |
| `app/{name}.js` | Server entry point |
| `app/config.json` | Configuration (port, PWA settings) |
| `app/VERSION` | Version number |
| `app/static/{name}/` | HTML, JS, CSS |
| `app/static/icons/` | PWA icons (icon-192.svg, icon-512.svg) |
| `app/static/locales/` | i18n translations |
| `app/docs/index.md` | About page content |
| `app/help/index.md` | Help page content |
| `.gitignore` | Excludes node_modules |

## Dependencies

The `package.json` typically includes:

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "express": "^4.18.2",
    "marked": "^9.0.0"
  }
}
```

## Run Script

The `run` script installs dependencies if needed:

```bash
#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
    npm install
fi
node app/{name}.js "$@"
```

## Server Entry Point

The main JavaScript file (`app/{name}.js`) follows this pattern:

```javascript
#!/usr/bin/env node
const path = require('path');

const SCRIPT_DIR = __dirname;
const PROJECT_DIR = path.dirname(SCRIPT_DIR);

const aideFrame = require(path.join(PROJECT_DIR, 'aide-frame', 'js', 'aide_frame'));
const { paths, config, httpRoutes, HttpServer } = aideFrame;

paths.init(SCRIPT_DIR);

// Load config
const cfg = config.loadConfig(
    path.join(SCRIPT_DIR, 'config.json'),
    { port: 8080 }
);

// Create server with PWA support
const server = new HttpServer({
    port: cfg.port,
    appDir: SCRIPT_DIR,
    docsConfig: {
        appName: 'My App',
        pwa: cfg.pwa && cfg.pwa.enabled ? cfg.pwa : null,
    },
});

// Register routes
httpRoutes.register(server.getApp(), server.docsConfig);

// Add custom routes...

server.run();
```
