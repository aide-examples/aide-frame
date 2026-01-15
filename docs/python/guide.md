# Guide (Python)

Getting started and architecture for aide-frame applications.

## Project Structure

```
my-app/
├── aide-frame/              # Git submodule
├── app/
│   ├── main.py              # Entry point
│   ├── static/index.html    # Web UI
│   ├── docs/index.md        # Documentation → /about
│   ├── help/index.md        # User help → /help
│   ├── sample_config.json   # Template (in repo)
│   └── config.json          # User settings (in .gitignore)
└── .gitignore
```

## Initialization Order

**Must be followed in every aide-frame app:**

```python
#!/usr/bin/env python3
import os, sys

# 1. PATH SETUP
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AIDE_FRAME_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), 'aide-frame', 'python')
if os.path.isdir(AIDE_FRAME_PATH):
    sys.path.insert(0, AIDE_FRAME_PATH)

# 2. PATHS INIT (before other aide-frame imports!)
from aide_frame import paths
paths.init(SCRIPT_DIR)

# 3. OTHER IMPORTS
from aide_frame import http_routes, http_server
from aide_frame.log import set_level
```

## Minimal App

```python
#!/usr/bin/env python3
import os, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(SCRIPT_DIR), 'aide-frame', 'python'))

from aide_frame import paths
paths.init(SCRIPT_DIR)

from aide_frame import http_routes, http_server

class MyHandler(http_server.JsonHandler):
    def get(self, path, params):
        if path == '/': return self.file('index.html')
        if path == '/api/hello': return {'message': 'Hello!'}
        return {'error': 'Not found'}, 404

http_server.HttpServer(
    port=8080,
    handler_class=MyHandler,
    app_dir=SCRIPT_DIR,
    docs_config=http_routes.DocsConfig(app_name="My App"),
).run()
```

## Static Files

`app/static/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/static/frame/css/base.css">
</head>
<body>
    <div class="container">
        <div class="header"><h1>My App</h1></div>
        <div class="card"><p>Hello World!</p></div>
    </div>
</body>
</html>
```

---

## Development vs Production

### Development (Git Submodule)

```bash
git submodule add ../aide-frame aide-frame
git submodule update --init
```

Update: `git submodule update --remote aide-frame`

### Production (Embedded)

For deployment, aide_frame is copied into `app/`:

```
app/
├── aide_frame/      # Embedded framework
├── main.py
└── ...
```

## Build & Release

```bash
./build.sh              # Build to deploy/
./build.sh --tarball    # Create release tarball
```

The build script:
1. Copies `app/` to `deploy/app/`
2. Copies `aide-frame/python/aide_frame/` into `deploy/app/aide_frame/`
3. Creates tarball for GitHub Release

### Release Workflow

```bash
echo "1.3.0" > app/VERSION
git add -A && git commit -m "Bump to 1.3.0"
./build.sh --tarball
git tag v1.3.0 && git push origin v1.3.0
# Upload releases/my-app-1.3.0.tar.gz to GitHub Release
```

## Remote Updates

The update system downloads tarballs from GitHub Releases:

```
CHECK → DOWNLOAD → APPLY → RESTART
                     ↓
                  ROLLBACK (on failure)
```

Configuration in `config.json`:

```json
{
    "remote_update": {
        "source": { "repo": "owner/repo-name" },
        "service_name": "myapp"
    }
}
```

**Important:** Upload the build tarball (with embedded aide_frame) as release asset, not GitHub's source tarball.
