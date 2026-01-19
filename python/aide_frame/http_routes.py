"""
HTTP route handlers for documentation and help viewing.

Provides reusable route handlers that apps can integrate into their
HTTP servers. This module does not implement an HTTP server - it provides
functions that handle specific routes.

Usage:
    from aide_frame import http_routes

    # Create configuration
    config = http_routes.DocsConfig(
        app_name="My App",
        back_link="/",
        back_text="Home",
        docs_dir_key="DOCS_DIR",
        help_dir_key="HELP_DIR",
    )

    # In your HTTP handler's do_GET method:
    if http_routes.handle_request(self, path, config):
        return  # Route was handled

    # ... handle other routes
"""

import os
import json
from dataclasses import dataclass, field
from typing import Optional, List, Tuple, Any, Dict

from . import paths, docs_viewer
from .log import logger


# Note: AIDE_FRAME_STATIC_DIR is registered by paths.init() and accessed via paths.get()


@dataclass
class CustomRoot:
    """Configuration for a custom Markdown viewing root.

    Apps can define additional roots beyond docs/ and help/ for viewing
    Markdown files from custom directories (e.g., contracts, reports).

    Example:
        CustomRoot(
            dir_key="CONTRACTS_DIR",
            title="Verträge",
            route="/contracts",
            subdir="contracts",  # optional: auto-register from APP_DIR/contracts
        )
    """
    dir_key: str  # Key in paths registry
    title: str  # Display title (e.g., "Contracts", "Reports")
    route: str  # URL route (e.g., "/contracts")
    subdir: Optional[str] = None  # Auto-register from APP_DIR/subdir if set
    use_sections: bool = False  # True for multi-section docs, False for flat
    section_defs: Optional[List[Tuple[Optional[str], Optional[str]]]] = None


@dataclass
class PWAConfig:
    """Configuration for Progressive Web App (PWA) support.

    When enabled, the framework serves /manifest.json and supports
    service worker registration for app installability.

    Example:
        PWAConfig(
            enabled=True,
            name="My App",
            short_name="MyApp",
            theme_color="#2563eb",
        )

    Use from_dict() to create from config that may have extra keys (like 'icon'):
        PWAConfig.from_dict(config.get('pwa', {}))
    """
    enabled: bool = False
    name: str = "AIDE App"
    short_name: str = "AIDE"
    description: str = ""
    theme_color: str = "#2563eb"
    background_color: str = "#ffffff"
    display: str = "standalone"
    start_url: str = "/"
    # Icon paths (absolute URLs, e.g., "/static/icons/icon-192.svg")
    icon_192: str = "/static/frame/icons/icon-192.svg"
    icon_512: str = "/static/frame/icons/icon-512.svg"

    @classmethod
    def from_dict(cls, data: dict) -> 'PWAConfig':
        """Create PWAConfig from dict, ignoring unknown keys (like 'icon')."""
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class DocsConfig:
    """Configuration for docs/help route handlers.

    Standard paths (docs/, help/) are auto-registered if they exist in APP_DIR.
    Warnings are logged if enabled features have missing directories.

    Custom roots can be added via the custom_roots parameter for app-specific
    Markdown directories (e.g., contracts, reports, templates).
    """

    # App identification
    app_name: str = "AIDE App"
    back_link: str = "/"
    back_text: str = "Back"

    # Documentation settings (for /about - multi-section docs)
    docs_dir_key: str = "DOCS_DIR"
    framework_dir_key: str = "AIDE_FRAME_DOCS_DIR"  # Auto-registered by paths.init()
    section_defs: Optional[List[Tuple[Optional[str], Optional[str]]]] = None

    # Help settings (for /help - simple flat structure)
    help_dir_key: str = "HELP_DIR"

    # Custom roots for app-specific Markdown directories
    custom_roots: Optional[Dict[str, CustomRoot]] = None

    # PWA configuration
    pwa: Optional[PWAConfig] = None

    # Features
    enable_mermaid: bool = True
    enable_docs: bool = True
    enable_help: bool = True

    def __post_init__(self):
        """Auto-register standard paths and validate configuration."""
        paths.ensure_initialized()

        # Auto-register standard paths if they exist and aren't already registered
        if paths.APP_DIR:
            self._auto_register_path(self.docs_dir_key, "docs")
            self._auto_register_path(self.help_dir_key, "help")

            # Auto-register custom roots with subdir specified
            if self.custom_roots:
                for name, root in self.custom_roots.items():
                    if root.subdir:
                        self._auto_register_path(root.dir_key, root.subdir)

        # Validate that enabled features have their directories
        self._validate()

    def _auto_register_path(self, key: str, subdir: str):
        """Register a standard path if it exists and isn't already registered."""
        if paths.get(key) is not None:
            return  # Already registered

        candidate = os.path.join(paths.APP_DIR, subdir)
        if os.path.isdir(candidate):
            paths.register(key, candidate)
            logger.debug(f"Auto-registered {key}: {candidate}")

    def _validate(self):
        """Log warnings for misconfigured features."""
        if self.enable_docs:
            docs_dir = paths.get(self.docs_dir_key)
            if not docs_dir or not os.path.isdir(docs_dir):
                logger.warning(
                    f"Docs enabled but {self.docs_dir_key} not found. "
                    f"Create docs/ directory or set enable_docs=False"
                )

        if self.enable_help:
            help_dir = paths.get(self.help_dir_key)
            if not help_dir or not os.path.isdir(help_dir):
                logger.warning(
                    f"Help enabled but {self.help_dir_key} not found. "
                    f"Create help/ directory or set enable_help=False"
                )


def _get_viewer_config(config: DocsConfig, root: str) -> dict:
    """Get viewer configuration for a specific root (docs/help/custom)."""
    if root == 'docs':
        return {
            'dir_key': config.docs_dir_key,
            'framework_dir_key': config.framework_dir_key,
            'section_defs': config.section_defs,
            'title_suffix': 'Documentation',
            'use_sections': True,
        }
    elif root == 'help':
        return {
            'dir_key': config.help_dir_key,
            'framework_dir_key': None,
            'section_defs': None,
            'title_suffix': 'Help',
            'use_sections': False,
        }
    elif config.custom_roots and root in config.custom_roots:
        custom = config.custom_roots[root]
        return {
            'dir_key': custom.dir_key,
            'framework_dir_key': None,
            'section_defs': custom.section_defs,
            'title_suffix': custom.title,
            'use_sections': custom.use_sections,
        }
    return None


def handle_request(handler: Any, path: str, config: DocsConfig) -> bool:
    """
    Handle a docs/help-related HTTP request.

    Args:
        handler: HTTP request handler with send_response, send_header,
                 end_headers, wfile methods (BaseHTTPRequestHandler compatible)
        path: Request path (e.g., "/about", "/api/viewer/structure?root=docs")
        config: DocsConfig instance with app settings

    Returns:
        True if request was handled, False to pass through to other handlers
    """
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(path)
    query_path = parsed.path
    params = parse_qs(parsed.query)

    # PWA manifest
    if query_path == '/manifest.json' and config.pwa and config.pwa.enabled:
        _serve_manifest(handler, config.pwa)
        return True

    # App config API
    if query_path == '/api/app/config':
        response = {
            "app_name": config.app_name,
            "back_link": config.back_link,
            "back_text": config.back_text,
            "features": {
                "mermaid": config.enable_mermaid,
                "docs": config.enable_docs,
                "help": config.enable_help,
            }
        }
        # Include custom roots info
        if config.custom_roots:
            response["custom_roots"] = {
                name: {
                    "title": root.title,
                    "route": root.route,
                }
                for name, root in config.custom_roots.items()
            }
        _send_json(handler, response)
        return True

    # Unified viewer API
    if query_path == '/api/viewer/structure':
        root = params.get('root', ['docs'])[0]
        viewer_cfg = _get_viewer_config(config, root)
        if not viewer_cfg:
            _send_json(handler, {"error": f"Unknown root: {root}"}, 400)
            return True

        if viewer_cfg['use_sections']:
            structure = docs_viewer.get_docs_structure(
                docs_dir_key=viewer_cfg['dir_key'],
                framework_dir_key=viewer_cfg['framework_dir_key'],
                section_defs=viewer_cfg['section_defs'],
            )
        else:
            # Flat structure - wrap in single section for consistent format
            flat = docs_viewer.get_structure(viewer_cfg['dir_key'], include_description=True)
            structure = {"sections": [{"name": viewer_cfg['title_suffix'], "docs": flat.get('files', [])}]}

        _send_json(handler, structure)
        return True

    if query_path == '/api/viewer/content':
        root = params.get('root', ['docs'])[0]
        file_path = params.get('path', ['index.md'])[0]
        viewer_cfg = _get_viewer_config(config, root)
        if not viewer_cfg:
            _send_json(handler, {"error": f"Unknown root: {root}"}, 400)
            return True

        # Check for framework docs
        framework = False
        if file_path.startswith('framework/'):
            framework = True
            file_path = file_path[10:]  # Remove 'framework/' prefix

        dir_key = viewer_cfg['framework_dir_key'] if framework else viewer_cfg['dir_key']
        content = docs_viewer.load_file(dir_key, file_path)

        if content is not None:
            _send_json(handler, {
                "content": content,
                "path": file_path,
                "framework": framework
            })
        else:
            _send_json(handler, {"error": f"Document not found: {file_path}"}, 404)
        return True

    # Viewer HTML pages
    if config.enable_docs and (query_path == '/about' or query_path == '/about.html'):
        _serve_template(handler, 'viewer.html')
        return True

    if config.enable_help and (query_path == '/help' or query_path == '/help.html'):
        _serve_template(handler, 'viewer.html')
        return True

    # Custom root viewer pages
    if config.custom_roots:
        for name, root in config.custom_roots.items():
            route = root.route.rstrip('/')
            if query_path == route or query_path == f"{route}.html":
                _serve_template(handler, 'viewer.html')
                return True

    # Docs assets (images, etc.) - support both roots
    if query_path.startswith('/docs-assets/'):
        asset_path = query_path[13:]  # Remove '/docs-assets/' prefix
        _serve_docs_asset(handler, asset_path, config.docs_dir_key)
        return True

    if query_path.startswith('/help-assets/'):
        asset_path = query_path[13:]  # Remove '/help-assets/' prefix
        _serve_docs_asset(handler, asset_path, config.help_dir_key)
        return True

    # Custom root assets
    if config.custom_roots:
        for name, root in config.custom_roots.items():
            asset_prefix = f"/{name}-assets/"
            if query_path.startswith(asset_prefix):
                asset_path = query_path[len(asset_prefix):]
                _serve_docs_asset(handler, asset_path, root.dir_key)
                return True

    # Static files from aide-frame
    if query_path.startswith('/static/frame/'):
        file_path = query_path[14:]  # Remove '/static/frame/' prefix
        _serve_frame_static(handler, file_path)
        return True

    # Legacy API compatibility (optional - can be removed later)
    if config.enable_docs:
        if query_path == '/api/docs/structure':
            structure = docs_viewer.get_docs_structure(
                docs_dir_key=config.docs_dir_key,
                framework_dir_key=config.framework_dir_key,
                section_defs=config.section_defs,
            )
            _send_json(handler, structure)
            return True

        if query_path.startswith('/api/docs/'):
            doc_path = query_path[10:]  # Remove '/api/docs/' prefix
            if not doc_path:
                files = docs_viewer.list_files_recursive(config.docs_dir_key)
                _send_json(handler, {"docs": files})
                return True

            framework = False
            if doc_path.startswith('framework/'):
                framework = True
                doc_path = doc_path[10:]

            dir_key = config.framework_dir_key if framework else config.docs_dir_key
            content = docs_viewer.load_file(dir_key, doc_path)

            if content is not None:
                _send_json(handler, {"content": content, "path": doc_path, "framework": framework})
            else:
                _send_json(handler, {"error": f"Document not found: {doc_path}"}, 404)
            return True

    if config.enable_help:
        if query_path == '/api/help/structure':
            structure = docs_viewer.get_structure(config.help_dir_key, include_description=True)
            _send_json(handler, structure)
            return True

        if query_path.startswith('/api/help/'):
            help_path = query_path[10:]
            if not help_path:
                structure = docs_viewer.get_structure(config.help_dir_key, include_description=True)
                _send_json(handler, structure)
                return True

            content = docs_viewer.load_file(config.help_dir_key, help_path)
            if content is not None:
                _send_json(handler, {"content": content, "path": help_path})
            else:
                _send_json(handler, {"error": f"Help file not found: {help_path}"}, 404)
            return True

    return False


def _send_json(handler: Any, data: dict, status: int = 200):
    """Send JSON response."""
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())


def _send_html(handler: Any, content: str, status: int = 200):
    """Send HTML response."""
    handler.send_response(status)
    handler.send_header('Content-Type', 'text/html; charset=utf-8')
    handler.end_headers()
    handler.wfile.write(content.encode())


def _serve_manifest(handler: Any, pwa: 'PWAConfig'):
    """Serve PWA manifest.json."""
    # Determine icon type from extension
    icon_ext = pwa.icon_192.rsplit('.', 1)[-1].lower()
    icon_type = "image/svg+xml" if icon_ext == "svg" else f"image/{icon_ext}"

    manifest = {
        "name": pwa.name,
        "short_name": pwa.short_name,
        "description": pwa.description,
        "start_url": pwa.start_url,
        "display": pwa.display,
        "theme_color": pwa.theme_color,
        "background_color": pwa.background_color,
        "icons": [
            {
                "src": pwa.icon_192,
                "sizes": "192x192",
                "type": icon_type,
                "purpose": "any maskable"
            },
            {
                "src": pwa.icon_512,
                "sizes": "512x512",
                "type": icon_type,
                "purpose": "any maskable"
            }
        ]
    }
    _send_json(handler, manifest)


def _send_file(handler: Any, filepath: str, mime_type: str, binary: bool = False):
    """Send file content."""
    try:
        mode = 'rb' if binary else 'r'
        encoding = None if binary else 'utf-8'
        with open(filepath, mode, encoding=encoding) as f:
            content = f.read()

        handler.send_response(200)
        handler.send_header('Content-Type', mime_type)
        handler.end_headers()

        if binary:
            handler.wfile.write(content)
        else:
            handler.wfile.write(content.encode())
    except FileNotFoundError:
        handler.send_error(404, f"File not found")
    except Exception as e:
        handler.send_error(500, f"Error reading file: {e}")


def _serve_template(handler: Any, template_name: str):
    """Serve an HTML template from aide-frame's static/templates directory."""
    paths.ensure_initialized()
    static_dir = paths.get("AIDE_FRAME_STATIC_DIR")
    template_path = os.path.join(static_dir, 'templates', template_name)

    if not os.path.isfile(template_path):
        handler.send_error(404, f"Template not found: {template_name}")
        return

    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        _send_html(handler, content)
    except Exception as e:
        handler.send_error(500, f"Error reading template: {e}")


def _serve_frame_static(handler: Any, file_path: str):
    """Serve a static file from aide-frame's static directory."""
    # Security: block path traversal
    if '..' in file_path or file_path.startswith('/'):
        handler.send_error(403, "Forbidden")
        return

    paths.ensure_initialized()
    static_dir = paths.get("AIDE_FRAME_STATIC_DIR")
    full_path = os.path.join(static_dir, file_path)

    if not os.path.isfile(full_path):
        handler.send_error(404, f"File not found: {file_path}")
        return

    ext = os.path.splitext(file_path)[1].lower()
    mime_type = paths.MIME_TYPES.get(ext, 'application/octet-stream')
    binary = ext in ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2')

    _send_file(handler, full_path, mime_type, binary)


def _serve_docs_asset(handler: Any, asset_path: str, docs_dir_key: str):
    """Serve a static asset from the docs directory."""
    # Security: block path traversal
    if '..' in asset_path or asset_path.startswith('/'):
        handler.send_error(403, "Forbidden")
        return

    paths.ensure_initialized()
    docs_dir = paths.get(docs_dir_key)
    if not docs_dir:
        handler.send_error(404, "Docs directory not configured")
        return

    filepath = os.path.join(docs_dir, asset_path)

    if not os.path.isfile(filepath):
        handler.send_error(404, f"Asset not found: {asset_path}")
        return

    ext = os.path.splitext(asset_path)[1].lower()
    mime_type = paths.MIME_TYPES.get(ext, 'application/octet-stream')
    binary = ext in ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp')

    _send_file(handler, filepath, mime_type, binary)


__all__ = [
    'CustomRoot',
    'DocsConfig',
    'PWAConfig',
    'handle_request',
]
