"""
QR code generation utilities for aide-frame applications.

Provides functions for generating QR codes as:
- Base64 data URLs (for web embedding)
- PIL Image objects (for further processing)
- Files on disk

All functions lazy-load the qrcode library to avoid import overhead
when QR codes are not used.

Usage:
    from aide_frame.qrcode_utils import generate_qr_base64, generate_qr_image

    # For web display
    data_url = generate_qr_base64("https://example.com")

    # For image processing
    img = generate_qr_image("https://example.com")
"""

import base64
import io
from typing import Optional, Tuple

from .log import logger


def is_available() -> bool:
    """Check if qrcode library is installed."""
    try:
        import qrcode
        return True
    except ImportError:
        return False


def generate_qr_image(
    data: str,
    box_size: int = 10,
    border: int = 2,
    fill_color: str = "black",
    back_color: str = "white",
):
    """
    Generate a QR code as a PIL Image.

    Args:
        data: Text or URL to encode
        box_size: Size of each QR code box in pixels
        border: Border size in boxes
        fill_color: QR code color (default black)
        back_color: Background color (default white)

    Returns:
        PIL Image object, or None if qrcode library not available

    Example:
        img = generate_qr_image("https://example.com")
        img.save("qr.png")
    """
    try:
        import qrcode
    except ImportError:
        logger.warning("qrcode library not installed. Run: pip install qrcode[pil]")
        return None

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    return qr.make_image(fill_color=fill_color, back_color=back_color)


def generate_qr_base64(
    data: str,
    box_size: int = 10,
    border: int = 2,
    fill_color: str = "black",
    back_color: str = "white",
) -> Optional[str]:
    """
    Generate a QR code as a base64 data URL.

    Args:
        data: Text or URL to encode
        box_size: Size of each QR code box in pixels
        border: Border size in boxes
        fill_color: QR code color
        back_color: Background color

    Returns:
        Data URL string like "data:image/png;base64,..." or None if unavailable

    Example:
        data_url = generate_qr_base64("https://example.com")
        # Use in HTML: <img src="{data_url}">
    """
    img = generate_qr_image(data, box_size, border, fill_color, back_color)
    if img is None:
        return None

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return f"data:image/png;base64,{img_base64}"


def generate_qr_file(
    data: str,
    output_path: str,
    box_size: int = 10,
    border: int = 2,
    fill_color: str = "black",
    back_color: str = "white",
) -> bool:
    """
    Generate a QR code and save to file.

    Args:
        data: Text or URL to encode
        output_path: Path to save the PNG file
        box_size: Size of each QR code box in pixels
        border: Border size in boxes
        fill_color: QR code color
        back_color: Background color

    Returns:
        True if successful, False otherwise
    """
    import os

    img = generate_qr_image(data, box_size, border, fill_color, back_color)
    if img is None:
        return False

    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        img.save(output_path, "PNG")
        logger.debug(f"Generated QR code: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to save QR code: {e}")
        return False


def resize_qr_image(img, size: Tuple[int, int]):
    """
    Resize a QR code image (Pillow version compatible).

    Args:
        img: PIL Image object
        size: Target size as (width, height)

    Returns:
        Resized PIL Image
    """
    try:
        from PIL import Image
        resample = Image.Resampling.NEAREST
    except (ImportError, AttributeError):
        # Pillow < 9.1.0
        from PIL import Image
        resample = Image.NEAREST

    return img.resize(size, resample)


__all__ = [
    'is_available',
    'generate_qr_image',
    'generate_qr_base64',
    'generate_qr_file',
    'resize_qr_image',
]
