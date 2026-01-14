"""
HTTP request utilities for server-side web requests.

This module provides simple functions for making HTTP requests from the server,
useful for fetching data from external APIs.

Example usage:
    from aide_frame.web_request import fetch_json, fetch_text

    # Fetch JSON from API
    data = fetch_json("https://api.example.com/data")
    if data:
        print(data["result"])

    # Fetch with custom headers
    data = fetch_json(
        "https://api.example.com/protected",
        headers={"Authorization": "Bearer token123"}
    )
"""

import urllib.request
import urllib.error
import json
from .log import logger


def fetch_json(url, headers=None, timeout=10):
    """
    Fetch and parse JSON from a URL.

    Args:
        url: The URL to fetch from
        headers: Optional dict of HTTP headers
        timeout: Request timeout in seconds (default: 10)

    Returns:
        Parsed JSON as dict/list, or None on error
    """
    try:
        req = urllib.request.Request(url)
        if headers:
            for key, value in headers.items():
                req.add_header(key, value)
        req.add_header('User-Agent', 'aide-frame/1.0')

        logger.debug(f"HTTP: GET {url}")
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode('utf-8')
            data = json.loads(body)
            # Log response preview (first 100 chars)
            preview = body[:100] + '...' if len(body) > 100 else body
            logger.debug(f"  -> {response.status} {preview}")
            return data
    except urllib.error.HTTPError as e:
        logger.error(f"HTTP error fetching {url}: {e.code} {e.reason}")
        return None
    except urllib.error.URLError as e:
        logger.error(f"URL error fetching {url}: {e.reason}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error from {url}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching {url}: {e}")
        return None


def fetch_text(url, headers=None, timeout=10):
    """
    Fetch text content from a URL.

    Args:
        url: The URL to fetch from
        headers: Optional dict of HTTP headers
        timeout: Request timeout in seconds (default: 10)

    Returns:
        Response body as string, or None on error
    """
    try:
        req = urllib.request.Request(url)
        if headers:
            for key, value in headers.items():
                req.add_header(key, value)
        req.add_header('User-Agent', 'aide-frame/1.0')

        logger.debug(f"HTTP: GET {url}")
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode('utf-8')
            # Log response preview (first 100 chars)
            preview = body[:100] + '...' if len(body) > 100 else body
            logger.debug(f"  -> {response.status} {preview}")
            return body
    except urllib.error.HTTPError as e:
        logger.error(f"HTTP error fetching {url}: {e.code} {e.reason}")
        return None
    except urllib.error.URLError as e:
        logger.error(f"URL error fetching {url}: {e.reason}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching {url}: {e}")
        return None
