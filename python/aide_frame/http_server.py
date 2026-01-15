"""
Simple HTTP server utilities for aide-frame applications.

Provides a lightweight HTTP server with JSON/HTML response helpers
and integrated docs/help route handling.

Usage:
    from aide_frame.http_server import HttpServer, JsonHandler

    class MyHandler(JsonHandler):
        def get(self, path, params):
            if path == '/': return self.file('index.html')
            if path == '/api/status': return {'ok': True}

        def post(self, path, data):
            if path == '/api/echo': return data

    server = HttpServer(port=8080, handler_class=MyHandler)
    server.run()  # Blocking, handles Ctrl+C
"""

import os
import json
import signal
import socket
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Optional, Any, Dict, Type

from . import paths, http_routes, update_routes
from .log import logger


def get_server_url(port: int, platform: str = None) -> str:
    """
    Get the best URL to reach the server.

    Tries in order:
    1. For WSL2: localhost (Windows host can access via localhost)
    2. Local IP via UDP socket trick
    3. FQDN if available
    4. Hostname as fallback

    Args:
        port: Server port
        platform: Platform string (e.g., 'wsl2', 'raspi', 'linux')

    Returns:
        URL string like "http://192.168.1.100:8080"
    """
    hostname = socket.gethostname()

    # WSL2: localhost works for Windows host access
    if platform == 'wsl2':
        return f"http://localhost:{port}"

    # Try to get local IP via UDP socket (doesn't actually send anything)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return f"http://{ip}:{port}"
    except Exception:
        pass

    # Try FQDN
    try:
        fqdn = socket.getfqdn()
        if fqdn and fqdn != hostname and '.' in fqdn:
            return f"http://{fqdn}:{port}"
    except Exception:
        pass

    return f"http://{hostname}:{port}"


def restart_server(delay: float = 0.5):
    """
    Restart the server process after a short delay.

    This exits the process with code 0, expecting systemd or similar
    to restart it automatically.

    Args:
        delay: Seconds to wait before exit (allows response to be sent)

    Returns:
        Dict with success message (for JSON response)
    """
    def delayed_exit():
        time.sleep(delay)
        os._exit(0)
    threading.Thread(target=delayed_exit, daemon=True).start()
    return {"success": True, "message": "Restarting..."}


class JsonHandler(BaseHTTPRequestHandler):
    """
    HTTP request handler with JSON/HTML convenience methods.

    Subclass and override get() and post() methods.
    Return a dict for JSON, a string for HTML, or None if handled manually.
    """

    # Set by HttpServer
    app_dir: str = None
    static_dir: str = None
    docs_config: Optional[http_routes.DocsConfig] = None
    update_config: Optional[update_routes.UpdateConfig] = None

    def log_message(self, format, *args):
        """Suppress default logging, use our logger instead."""
        # args[0] is like "GET /path HTTP/1.1" - extract method and path
        # But for errors, args[0] can be an int (error code)
        if not args or not isinstance(args[0], str):
            return
        parts = args[0].split()
        if len(parts) >= 2:
            path = parts[1]
            # Skip static file requests (html, css, js, images)
            if path.startswith('/static/') or path.endswith(('.html', '.css', '.js', '.png', '.jpg', '.ico', '.svg', '.woff', '.woff2')):
                return
            # Only log API calls
            if path.startswith('/api/') or parts[0] == 'POST':
                logger.debug(f"HTTP: {parts[0]} {path}")

    # -------------------------------------------------------------------------
    # Response helpers
    # -------------------------------------------------------------------------

    def send_json(self, data: dict, status: int = 200):
        """Send JSON response."""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        body = json.dumps(data)
        # Log response preview (first 80 chars)
        preview = body[:80] + '...' if len(body) > 80 else body
        logger.debug(f"  -> {status} {preview}")
        self.wfile.write(body.encode())

    def send_html(self, content: str, status: int = 200):
        """Send HTML response."""
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(content.encode())

    def send_text(self, content: str, content_type: str = 'text/plain', status: int = 200):
        """Send text response with custom content type."""
        self.send_response(status)
        self.send_header('Content-Type', f'{content_type}; charset=utf-8')
        self.end_headers()
        self.wfile.write(content.encode())

    def send_file(self, filepath: str, content_type: str = None, binary: bool = False):
        """Send file content."""
        if not os.path.isfile(filepath):
            self.send_json({'error': 'File not found'}, 404)
            return

        if content_type is None:
            ext = os.path.splitext(filepath)[1].lower()
            content_type = paths.MIME_TYPES.get(ext, 'application/octet-stream')
            binary = ext in ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp')

        try:
            mode = 'rb' if binary else 'r'
            encoding = None if binary else 'utf-8'
            with open(filepath, mode, encoding=encoding) as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.end_headers()

            if binary:
                self.wfile.write(content)
            else:
                self.wfile.write(content.encode())
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def file(self, filename: str) -> None:
        """Serve a file from the app's static directory. Returns None to signal handled."""
        if self.static_dir:
            filepath = os.path.join(self.static_dir, filename)
            self.send_file(filepath)
        else:
            self.send_json({'error': 'Static directory not configured'}, 500)
        return None

    # -------------------------------------------------------------------------
    # Request handling
    # -------------------------------------------------------------------------

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        # Let http_routes handle docs/help routes first
        if self.docs_config and http_routes.handle_request(self, self.path, self.docs_config):
            return

        # Let update_routes handle update routes
        if self.update_config and update_routes.handle_update_request(self, path, 'GET', {}, self.update_config):
            return

        # Serve static files from /static/ path (e.g., locales, images)
        if path.startswith('/static/') and self.static_dir:
            filename = path[8:]  # Remove '/static/' prefix
            if '..' not in filename and not filename.startswith('/'):
                filepath = os.path.join(self.static_dir, filename)
                if os.path.isfile(filepath):
                    self.send_file(filepath)
                    return

        params = {k: v[0] if len(v) == 1 else v for k, v in parse_qs(parsed.query).items()}

        result = self.get(path, params)
        self._send_result(result)

    def do_POST(self):
        """Handle POST requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        # Read and parse body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self.send_json({'error': 'Invalid JSON'}, 400)
            return

        # Let update_routes handle update routes
        if self.update_config and update_routes.handle_update_request(self, path, 'POST', data, self.update_config):
            return

        result = self.post(path, data)
        self._send_result(result)

    def _send_result(self, result):
        """Send result based on type."""
        if result is None:
            return  # Already handled
        elif isinstance(result, dict):
            self.send_json(result)
        elif isinstance(result, str):
            self.send_html(result)
        elif isinstance(result, tuple) and len(result) == 2:
            # (data, status) tuple
            data, status = result
            if isinstance(data, dict):
                self.send_json(data, status)
            else:
                self.send_html(str(data), status)

    # -------------------------------------------------------------------------
    # Override these in subclass
    # -------------------------------------------------------------------------

    def get(self, path: str, params: Dict[str, Any]) -> Optional[Any]:
        """
        Handle GET request. Override in subclass.

        Args:
            path: URL path (e.g., '/api/status')
            params: Query parameters as dict

        Returns:
            - dict: Sent as JSON
            - str: Sent as HTML
            - None: Already handled (e.g., via self.file())
            - (data, status): Tuple with status code
        """
        return {'error': 'Not found'}, 404

    def post(self, path: str, data: Dict[str, Any]) -> Optional[Any]:
        """
        Handle POST request. Override in subclass.

        Args:
            path: URL path
            data: Parsed JSON body

        Returns:
            Same as get()
        """
        return {'error': 'Not found'}, 404


class HttpServer:
    """
    Simple HTTP server with lifecycle management.

    Usage:
        server = HttpServer(port=8080, handler_class=MyHandler)
        server.run()  # Blocking

        # Or non-blocking:
        server.start()
        # ... do other things ...
        server.stop()
    """

    def __init__(
        self,
        port: int = 8080,
        handler_class: Type[JsonHandler] = JsonHandler,
        app_dir: str = None,
        static_dir: str = None,
        docs_config: http_routes.DocsConfig = None,
        update_config: update_routes.UpdateConfig = None,
    ):
        """
        Initialize HTTP server.

        Args:
            port: Port to listen on
            handler_class: Handler class (subclass of JsonHandler)
            app_dir: Application directory (for paths.init)
            static_dir: Directory for static files (default: app_dir/static)
            docs_config: DocsConfig for docs/help routes
            update_config: UpdateConfig for remote update functionality
        """
        self.port = port
        self.handler_class = handler_class
        self.app_dir = app_dir
        self.static_dir = static_dir or (os.path.join(app_dir, 'static') if app_dir else None)
        self.docs_config = docs_config
        self.update_config = update_config

        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False

    def start(self):
        """Start the server in a background thread."""
        if self._running:
            return

        # Initialize paths if app_dir provided
        if self.app_dir:
            paths.init(self.app_dir)

        # Configure handler class
        self.handler_class.app_dir = self.app_dir
        self.handler_class.static_dir = self.static_dir
        self.handler_class.docs_config = self.docs_config
        self.handler_class.update_config = self.update_config

        self._server = HTTPServer(('0.0.0.0', self.port), self.handler_class)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        self._running = True

        logger.info(f"Server started on http://localhost:{self.port}")

    def stop(self):
        """Stop the server."""
        if self._server:
            self._server.shutdown()
            self._running = False
            logger.info("Server stopped")

    def run(self):
        """Start server and block until Ctrl+C."""
        self.start()

        # Handle Ctrl+C gracefully
        shutdown_event = threading.Event()

        def signal_handler(sig, frame):
            logger.info("Shutting down...")
            shutdown_event.set()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        logger.info("Press Ctrl+C to stop")

        # Wait for shutdown signal
        try:
            shutdown_event.wait()
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()


__all__ = [
    'JsonHandler',
    'HttpServer',
    'get_server_url',
    'restart_server',
]
