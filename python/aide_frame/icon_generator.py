"""
PWA icon generator for aide-frame applications.

Generates SVG icons based on configuration, with automatic caching
based on config hash to avoid unnecessary regeneration.

Usage:
    from aide_frame.icon_generator import ensure_icons

    # In your app startup, after loading config:
    pwa_config = config.get('pwa', {})
    ensure_icons(app_dir, pwa_config)

    # Or with force regeneration:
    ensure_icons(app_dir, pwa_config, force=True)
"""

import hashlib
import json
import os
import re
from typing import Optional

from .log import logger


def _compute_icon_hash(icon_config: dict, theme_color: str) -> str:
    """
    Compute a hash of the icon configuration for cache validation.

    Args:
        icon_config: The pwa.icon configuration dict
        theme_color: The theme_color from PWA config (used as default background)

    Returns:
        Short hash string
    """
    # Create a stable representation of the config
    config_for_hash = {
        'background': icon_config.get('background', theme_color or '#2563eb'),
        'line1_text': icon_config.get('line1_text', 'aide'),
        'line1_color': icon_config.get('line1_color', '#94a3b8'),
        'line1_size': icon_config.get('line1_size', 0.25),
        'line2_text': icon_config.get('line2_text', ''),
        'line2_color': icon_config.get('line2_color', '#ffffff'),
        'line2_size': icon_config.get('line2_size', 0.45),
    }
    config_str = json.dumps(config_for_hash, sort_keys=True)
    return hashlib.md5(config_str.encode()).hexdigest()[:12]


def _extract_hash_from_svg(svg_path: str) -> Optional[str]:
    """
    Extract the config hash from an existing SVG file.

    Args:
        svg_path: Path to the SVG file

    Returns:
        Hash string if found, None otherwise
    """
    if not os.path.isfile(svg_path):
        return None

    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Look for: <!-- aide-icon-hash: abc123def456 -->
        match = re.search(r'<!-- aide-icon-hash: ([a-f0-9]+) -->', content)
        if match:
            return match.group(1)
    except (IOError, OSError):
        pass

    return None


def _generate_svg(size: int, icon_config: dict, theme_color: str, config_hash: str) -> str:
    """
    Generate SVG content for an icon.

    The icon has two lines of text:
    - Line 1: Small italic text near top (e.g., "aide")
    - Line 2: Larger bold text below, vertically centered (e.g., "Py")

    Args:
        size: Icon size in pixels (192 or 512)
        icon_config: The pwa.icon configuration dict
        theme_color: Fallback background color from PWA config
        config_hash: Hash to embed in the SVG

    Returns:
        SVG content as string
    """
    # Extract config with defaults
    background = icon_config.get('background', theme_color or '#2563eb')
    line1_text = icon_config.get('line1_text', 'aide')
    line1_color = icon_config.get('line1_color', '#94a3b8')
    line1_size = icon_config.get('line1_size', 0.25)
    line2_text = icon_config.get('line2_text', '')
    line2_color = icon_config.get('line2_color', '#ffffff')
    line2_size = icon_config.get('line2_size', 0.45)

    # Calculate font sizes based on icon size
    font_size_1 = int(size * line1_size)
    font_size_2 = int(size * line2_size)

    # Calculate Y positions for visual balance
    # Line 1: small text near top, positioned at ~35% from top
    # Line 2: larger text centered, positioned at ~70% from top
    y1 = int(size * 0.35)
    y2 = int(size * 0.70)

    # Center X position
    cx = size // 2

    # Build SVG
    svg_lines = [
        f'<!-- aide-icon-hash: {config_hash} -->',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">',
        f'  <rect width="{size}" height="{size}" fill="{background}"/>',
    ]

    # Line 1: small italic text
    if line1_text:
        svg_lines.append(
            f'  <text x="{cx}" y="{y1}" '
            f'font-family="Arial, Helvetica, sans-serif" '
            f'font-size="{font_size_1}" '
            f'font-style="italic" '
            f'fill="{line1_color}" '
            f'text-anchor="middle">{_escape_xml(line1_text)}</text>'
        )

    # Line 2: large bold text
    if line2_text:
        svg_lines.append(
            f'  <text x="{cx}" y="{y2}" '
            f'font-family="Arial, Helvetica, sans-serif" '
            f'font-size="{font_size_2}" '
            f'font-weight="bold" '
            f'fill="{line2_color}" '
            f'text-anchor="middle">{_escape_xml(line2_text)}</text>'
        )

    svg_lines.append('</svg>')
    svg_lines.append('')  # Final newline

    return '\n'.join(svg_lines)


def _escape_xml(text: str) -> str:
    """Escape special XML characters."""
    return (
        text
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&apos;')
    )


def ensure_icons(app_dir: str, pwa_config: dict, force: bool = False) -> bool:
    """
    Generate PWA icons if needed.

    Icons are generated to app_dir/static/icons/ as icon-192.svg and icon-512.svg.
    A hash of the icon configuration is embedded in each SVG file as an XML comment.
    Icons are only regenerated if:
    - The icon files don't exist
    - The embedded hash doesn't match the current config
    - force=True is passed

    Args:
        app_dir: Path to the app directory (e.g., /path/to/project/app)
        pwa_config: The full PWA configuration dict (from config.get('pwa', {}))
        force: Force regeneration even if hash matches

    Returns:
        True if icons were generated, False if existing icons were kept

    Example:
        from aide_frame.icon_generator import ensure_icons

        config = load_config('config.json')
        pwa_config = config.get('pwa', {})

        # Only generates if needed
        if ensure_icons(app_dir, pwa_config):
            print("Icons regenerated")
        else:
            print("Icons up to date")
    """
    # Check if icon generation is configured
    icon_config = pwa_config.get('icon', {})

    # line2_text is required - if not set, skip icon generation
    if not icon_config.get('line2_text'):
        logger.debug("PWA icon generation skipped: no pwa.icon.line2_text configured")
        return False

    # Set up paths
    icons_dir = os.path.join(app_dir, 'static', 'icons')
    icon_192_path = os.path.join(icons_dir, 'icon-192.svg')
    icon_512_path = os.path.join(icons_dir, 'icon-512.svg')

    # Compute expected hash
    theme_color = pwa_config.get('theme_color', '#2563eb')
    expected_hash = _compute_icon_hash(icon_config, theme_color)

    # Check if regeneration is needed
    if not force:
        existing_hash_192 = _extract_hash_from_svg(icon_192_path)
        existing_hash_512 = _extract_hash_from_svg(icon_512_path)

        if existing_hash_192 == expected_hash and existing_hash_512 == expected_hash:
            logger.debug(f"PWA icons up to date (hash: {expected_hash})")
            return False

        if existing_hash_192 is None or existing_hash_512 is None:
            logger.info("Generating PWA icons (new or missing)")
        else:
            logger.info(f"Regenerating PWA icons (config changed)")
    else:
        logger.info("Force-regenerating PWA icons")

    # Create icons directory if needed
    os.makedirs(icons_dir, exist_ok=True)

    # Generate both icons
    svg_192 = _generate_svg(192, icon_config, theme_color, expected_hash)
    svg_512 = _generate_svg(512, icon_config, theme_color, expected_hash)

    # Write files
    try:
        with open(icon_192_path, 'w', encoding='utf-8') as f:
            f.write(svg_192)

        with open(icon_512_path, 'w', encoding='utf-8') as f:
            f.write(svg_512)

        logger.info(f"Generated PWA icons: {icons_dir}/icon-{{192,512}}.svg")
        return True

    except (IOError, OSError) as e:
        logger.error(f"Failed to write PWA icons: {e}")
        return False


__all__ = [
    'ensure_icons',
]
