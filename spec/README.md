# aide-frame Specification

This directory contains the language-agnostic specification for aide-frame modules.

## Purpose

The specification defines:
- What each module does
- Required interfaces/APIs
- Expected behavior
- Configuration formats

Implementations (Python, Node.js, etc.) should follow this specification.

## Modules

| Module | Description | Status |
|--------|-------------|--------|
| config | Configuration loading and management | Documented |
| logging | Application logging with levels | Documented |
| paths | Path management and static file serving | Documented |
| platform_detect | Platform detection (Raspi, WSL, Linux, macOS) | Documented |
| update | Remote update mechanism | Documented |
| web_request | Server-side HTTP requests | Planned |

## Documentation

See `python/aide_frame/docs/` for detailed module documentation.
