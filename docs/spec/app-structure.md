# Application Structure Guide

All aide-frame applications should follow a consistent code structure for maintainability and to ensure Claude can correctly set up new projects.

## Main Entry File Structure

The main entry file (e.g., `app/myapp.py` or `app/myapp.js`) should be organized with numbered section headers in this order:

### Python Applications

```
1. PATH SETUP          - Define SCRIPT_DIR, PROJECT_DIR, add aide-frame to path
2. AIDE-FRAME INIT     - Import paths module and call paths.init(SCRIPT_DIR)
3. AIDE-FRAME IMPORTS  - Import framework modules (http_server, http_routes, args, etc.)
4. APP IMPORTS         - Import application-specific modules
5. CONFIGURATION       - Define DEFAULT_CONFIG with sensible defaults
6. HTTP HANDLER        - Define request handler class extending JsonHandler
7. ARGUMENT PARSING    - Use framework's args module (add_common_args, apply_common_args)
8. SERVER SETUP        - Create HttpServer with docs_config and update_config
9. START SERVER        - Call server.run()
```

### JavaScript Applications

```
1. PATH SETUP          - Define SCRIPT_DIR, PROJECT_DIR
2. AIDE-FRAME INIT     - Require aide-frame and call paths.init(SCRIPT_DIR)
3. APP IMPORTS         - Require application-specific modules
4. CONFIGURATION       - Define DEFAULT_CONFIG with sensible defaults
5. ARGUMENT PARSING    - Use framework's args module (addCommonArgs, applyCommonArgs)
6. SERVER SETUP        - Create HttpServer with docsConfig and updateConfig
7. ROUTES              - Define application routes using server.getApp()
8. START SERVER        - Call server.run()
```

## Key Patterns

### Use the Framework's Args Module

The args module provides common command-line options that all apps should support:
- `--config` - Path to config file
- `--log-level` - Logging verbosity
- `--regenerate-icons` - Force PWA icon regeneration

Python:
```python
from aide_frame.args import add_common_args, apply_common_args

parser = argparse.ArgumentParser(description='My App')
add_common_args(parser, config_default='config.json')
parser.add_argument('--port', '-p', type=int, help='Override port')
args = parser.parse_args()

config = apply_common_args(args, config_defaults=DEFAULT_CONFIG, app_dir=SCRIPT_DIR)
```

JavaScript:
```javascript
const { args } = require('aide-frame');

program.description('My App');
args.addCommonArgs(program);
program.option('-p, --port <number>', 'Override port', parseInt);
program.parse();

const cfg = args.applyCommonArgs(opts, {
    configDefaults: DEFAULT_CONFIG,
    configSearchPaths: [path.join(SCRIPT_DIR, 'config.json')],
    appDir: SCRIPT_DIR,
});
```

**Important:** Always include `configSearchPaths` pointing to `SCRIPT_DIR` so the config is found regardless of where the app is started from (e.g., when using PM2 or systemd).

### Let HttpServer Auto-Register Routes

HttpServer automatically registers docs/help and update routes when configs are provided. Don't import httpRoutes/updateRoutes separately for registration.

### Pass PWA Config to DocsConfig

For manifest.json serving, pass the PWA config to docsConfig. Use `from_dict()` to filter out unknown keys (like `icon` used by the icon generator):

Python:
```python
pwa=http_routes.PWAConfig.from_dict(config.get('pwa', {})) if config.get('pwa', {}).get('enabled') else None
```

JavaScript:
```javascript
pwa: cfg.pwa && cfg.pwa.enabled ? cfg.pwa : null
```

### Keep Configuration Simple

- Keep DEFAULT_CONFIG inline for simple apps
- Use a separate config module only for complex apps with many settings
- Don't mutate framework globals; pass configuration through constructors instead

### Resolve Config Path

In Python, resolve the config path relative to SCRIPT_DIR before calling apply_common_args:

```python
if not os.path.isabs(args.config):
    args.config = os.path.join(SCRIPT_DIR, args.config)
```

## Section Header Format

Use consistent comment formatting for section headers:

Python:
```python
# =============================================================================
# 1. PATH SETUP
# =============================================================================
```

JavaScript:
```javascript
// =============================================================================
// 1. PATH SETUP
// =============================================================================
```

For subsections within `if __name__ == '__main__':` (Python), use shorter separators:
```python
    # =========================================================================
    # 8. SERVER SETUP
    # =========================================================================
```

## Framework Integration: Development vs Production

Apps include aide-frame as a git submodule pointing to GitHub. This ensures that cloning an app "just works" - users get a working copy without needing local aide-frame.

```
[submodule "aide-frame"]
    url = https://github.com/aide-examples/aide-frame.git
```

### Two Modes

| Mode | aide-frame is... | Use case |
|------|------------------|----------|
| **Production** (default) | Git submodule from GitHub | Users, testers, CI/CD |
| **Development** | Symlink to local directory | Framework developers |

### For Users/Testers (Production Mode)

Clone with submodules and run:

```bash
git clone --recurse-submodules https://github.com/aide-examples/aide-irma.git
cd aide-irma
npm install  # or: pip install (for Python apps)
./run
```

### For Developers (Development Mode)

If you're developing aide-frame alongside apps, use symlinks for instant changes:

```bash
# From the app directory:
../aide-frame/dev-mode.sh
```

This script:
1. Removes the submodule
2. Creates a symlink: `aide-frame` → `/home/gero/aide-examples/aide-frame`
3. Adds `aide-frame` to `.gitignore` (local only, not committed)

Now any change to `/home/gero/aide-examples/aide-frame` is instantly visible in the app.

### Switching Back to Production Mode

To restore the submodule (e.g., before committing or releasing):

```bash
# From the app directory:
../aide-frame/prod-mode.sh [commit-or-tag]
```

This script:
1. Removes the symlink
2. Adds aide-frame as a submodule from GitHub
3. Checks out the specified commit (or current aide-frame HEAD)
4. Removes `aide-frame` from `.gitignore`

### Development Workflow

1. Set up dev mode in your apps: `../aide-frame/dev-mode.sh`
2. Edit aide-frame code → changes visible instantly in all apps
3. Test in your apps
4. When satisfied, commit and push aide-frame to GitHub
5. Switch apps to prod mode: `../aide-frame/prod-mode.sh`
6. Commit and push apps

### What Gets Committed

The app repository **never** contains a copy of aide-frame files. Git stores:
- `.gitmodules` - URL pointing to GitHub
- A commit SHA reference - which aide-frame version to use

The actual framework files are fetched from GitHub when cloning.

### Creating Release Archives

When in dev mode (symlink), creating tar/zip archives would include the symlink rather than the actual framework files. Use the build-release script to create proper archives:

```bash
# From the app directory:
../aide-frame/build-release.sh           # Creates .tar.gz
../aide-frame/build-release.sh zip       # Creates .zip
../aide-frame/build-release.sh both      # Creates both formats
../aide-frame/build-release.sh tar v1.0  # Use specific aide-frame version
```

This script:
1. Detects if in dev mode (symlink)
2. Switches to prod mode temporarily (submodule)
3. Creates archive with version from `app/VERSION` if present
4. Switches back to dev mode automatically
5. Outputs to `releases/` directory (gitignored)

The resulting archive contains aide-frame as a proper submodule, so users can extract and run without having aide-frame locally.
