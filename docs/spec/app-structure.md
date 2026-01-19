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

const cfg = args.applyCommonArgs(opts, { configDefaults: DEFAULT_CONFIG, appDir: SCRIPT_DIR });
```

### Let HttpServer Auto-Register Routes

HttpServer automatically registers docs/help and update routes when configs are provided. Don't import httpRoutes/updateRoutes separately for registration.

### Pass PWA Config to DocsConfig

For manifest.json serving, pass the PWA config to docsConfig:

Python:
```python
pwa=http_routes.PWAConfig(**config.get('pwa', {})) if config.get('pwa', {}).get('enabled') else None
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
