"""
Common command-line argument handling for aide-frame applications.

Provides reusable argument definitions that apps can add to their parsers.

Usage:
    from aide_frame.args import add_common_args, apply_common_args

    parser = argparse.ArgumentParser(description='My App')
    add_common_args(parser)  # adds --log-level, --config
    parser.add_argument('--port', type=int, default=8080)  # app-specific
    args = parser.parse_args()
    apply_common_args(args)  # applies log level, loads config
"""

import argparse
from typing import Optional, List, Dict, Any

from .log import set_level
from .config import load_config


def add_common_args(parser: argparse.ArgumentParser,
                    include_log: bool = True,
                    include_config: bool = True,
                    config_default: str = 'config.json') -> None:
    """
    Add common aide-frame arguments to a parser.

    Args:
        parser: The ArgumentParser to add arguments to
        include_log: Add --log-level argument
        include_config: Add --config argument
        config_default: Default config file name
    """
    if include_log:
        parser.add_argument(
            '--log-level', '-l',
            default='INFO',
            choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
            help='Log level (default: INFO)'
        )

    if include_config:
        parser.add_argument(
            '--config', '-c',
            default=config_default,
            help=f'Config file path (default: {config_default})'
        )


def apply_common_args(args: argparse.Namespace,
                      config_search_paths: Optional[List[str]] = None,
                      config_defaults: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Apply common aide-frame arguments.

    Args:
        args: Parsed arguments namespace
        config_search_paths: Additional paths to search for config file
        config_defaults: Default config values

    Returns:
        Loaded config dict if --config was used, None otherwise
    """
    # Apply log level
    if hasattr(args, 'log_level'):
        set_level(args.log_level)

    # Load config if argument exists
    config = None
    if hasattr(args, 'config'):
        search_paths = config_search_paths or []
        config = load_config(
            config_path=args.config,
            search_paths=search_paths,
            defaults=config_defaults or {}
        )

    return config
