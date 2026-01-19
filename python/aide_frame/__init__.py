"""
AIDE Frame - Application Framework for Raspberry Pi Projects.

A lightweight framework providing common infrastructure for Python applications:
- Logging configuration
- Path management
- Configuration loading
- Platform detection (Raspberry Pi, WSL2, Linux desktop, etc.)
- Remote updates from GitHub

Usage:
    from aide_frame import log, paths, config, platform_detect

    # Initialize paths first
    paths.init()

    # Use logging
    log.info("Application started")

    # Load config
    cfg = config.load_config("config.json")

    # Check platform
    if platform_detect.PLATFORM == 'raspi':
        # Raspberry Pi specific code
        pass
"""

from . import log
from . import paths
from . import config
from . import platform_detect
from . import docs_viewer
from . import http_routes
from . import http_server
from . import update_routes
from . import args
from . import qrcode_utils
from . import icon_generator

__version__ = "1.2.0"

__all__ = [
    'log',
    'paths',
    'config',
    'platform_detect',
    'docs_viewer',
    'http_routes',
    'http_server',
    'update_routes',
    'args',
    'qrcode_utils',
    'icon_generator',
]
