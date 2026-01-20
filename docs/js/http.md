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
