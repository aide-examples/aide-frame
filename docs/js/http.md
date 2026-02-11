# HTTP Server (Node.js)

HTTP server and route handling for aide-frame applications.

## HttpServer

Express-based HTTP server with lifecycle management.

```javascript
const { HttpServer, paths } = require('aide-frame');

const server = new HttpServer({
    port: 8080,
    appDir: __dirname,
    staticDir: path.join(__dirname, 'static'),
    docsConfig: {
        appName: 'My App',
        backLink: '/',
        enableDocs: true,
        enableHelp: true,
    },
    updateConfig: {
        githubRepo: 'user/repo',
        branch: 'main',
    }
});

// Add custom routes
server.addRoutes((app) => {
    app.get('/', (req, res) => res.json({ hello: 'world' }));
});

// Start (non-blocking)
await server.start();

// Or run (blocking, handles Ctrl+C)
server.run();
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 8080 | Port to listen on |
| `basePath` | string | `''` | Base URL path for reverse proxy mounting (e.g., `/irma`) |
| `appDir` | string | - | Application directory |
| `staticDir` | string | appDir/static | Static files directory |
| `docsConfig` | object | - | Docs/help configuration |
| `updateConfig` | object | - | Update system configuration |

### Methods

| Method | Description |
|--------|-------------|
| `start()` | Start server (returns Promise) |
| `stop()` | Stop server |
| `run()` | Start and block until Ctrl+C |
| `addRoutes(callback)` | Add custom routes |
| `getApp()` | Get Express app instance |

## Static File Serving

Static files are automatically served from two locations:

| Route | Source |
|-------|--------|
| `/static/frame/*` | Framework assets (CSS, JS, templates) |
| `/static/*` | Application assets |

## Docs/Help Routes

When `docsConfig` is provided, these routes are registered:

| Route | Description |
|-------|-------------|
| `/about` | Documentation viewer |
| `/help` | Help viewer |
| `/api/app/config` | App configuration |
| `/api/viewer/structure` | Docs structure |
| `/api/viewer/content` | Markdown content (GET) / Save content (POST) |

### Online Editing

When `docsEditable` or `helpEditable` is set to `true`, users can edit Markdown documents directly in the browser:

- Right-click on any heading opens a section editor
- Edits are saved via `POST /api/viewer/content`
- Framework documentation is always read-only

### DocsConfig Options

```javascript
{
    appName: 'My App',      // Application name
    backLink: '/',          // Back button URL
    backText: 'Back',       // Back button text
    docsDirKey: 'DOCS_DIR', // Path key for docs directory
    helpDirKey: 'HELP_DIR', // Path key for help directory
    enableMermaid: true,    // Enable Mermaid diagrams
    enableDocs: true,       // Enable /about route
    enableHelp: true,       // Enable /help route
    docsEditable: false,    // Enable editing for /about (default: false)
    helpEditable: false,    // Enable editing for /help (default: false)
    viewerHooks: null,      // URL to JS file for content post-processing
    customRoots: {},        // Additional Markdown roots
}
```

## Update Routes

When `updateConfig` is provided, these routes are registered:

| Route | Method | Description |
|-------|--------|-------------|
| `/api/update/status` | GET | Current update status |
| `/api/update/check` | POST | Check for updates |
| `/api/update/download` | POST | Download update |
| `/api/update/apply` | POST | Apply update |
| `/update` | GET | Update management page |

### UpdateConfig Options

```javascript
{
    githubRepo: 'user/repo',  // GitHub repository
    branch: 'main',           // Branch to check
    serviceName: 'my-app',    // Systemd service name
}
```

## Helper Functions

### getServerUrl(port, platform)

Get the best URL to reach the server.

```javascript
const { getServerUrl } = require('aide-frame').httpServer;
const url = getServerUrl(8080, 'wsl2');
// Returns: "http://localhost:8080" for WSL2
// Or: "http://192.168.1.100:8080" for others
```

### restartServer(delay)

Restart the server process (for systemd restart).

```javascript
const { restartServer } = require('aide-frame').httpServer;
res.json(restartServer(0.5)); // Exits after 0.5 seconds
```

## CLI Options

The `args` module provides CLI flags for server configuration:

```bash
node app.js --port 8080
node app.js -p 8080                # Short form
node app.js --base-path /irma      # Reverse proxy base path
node app.js -b /irma -p 8080       # Combined
```

| Flag | Description |
|------|-------------|
| `-p, --port <number>` | Override server port from config |
| `-b, --base-path <path>` | Base URL path for reverse proxy (e.g., `/irma`) |

### Base Path (Reverse Proxy Support)

The `--base-path` option enables running the application behind a reverse proxy at a sub-path. This is useful when multiple instances share a single domain:

```bash
# Instance 1: https://server/irma/
./run -s irma -p 18354 --base-path /irma

# Instance 2: https://server/demo/
./run -s demo -p 18355 --base-path /demo
```

**How it works:**

1. **Server**: The Express app is mounted as a sub-app under the base path. All existing routes remain unchanged — Express strips the prefix automatically.
2. **Client**: A `<base href="/irma/">` tag is injected into HTML responses. All asset and API paths are relative (e.g., `api/meta` instead of `/api/meta`), so the browser resolves them correctly via the base tag.
3. **Cookies**: Session cookies are scoped to the base path, so multiple instances don't interfere with each other.

**Behavior:**

| URL | Response |
|-----|----------|
| `/irma` | 301 redirect to `/irma/` |
| `/irma/` | Application HTML with `<base href="/irma/">` |
| `/irma/api/...` | API endpoints |
| `/irma/static/...` | Static assets |
| `/` | 404 (only base path routes are active) |

Without `--base-path`, the app runs at `/` as before (no `<base>` tag injected).

**nginx example:**

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location /irma/ {
        proxy_pass http://localhost:18354/irma/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /demo/ {
        proxy_pass http://localhost:18355/demo/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
