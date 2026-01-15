# Logging

Centralized, configurable logging for all application modules.

## Purpose

Applications need consistent logging across all components:
- Unified output format
- Configurable verbosity levels
- Single configuration point
- Systemd-friendly output (no duplicate timestamps when running as service)

## Log Levels

| Level | Value | When to Use |
|-------|-------|-------------|
| `DEBUG` | 10 | Detailed information for debugging |
| `INFO` | 20 | Normal operation messages (default) |
| `WARNING` | 30 | Something unexpected but not fatal |
| `ERROR` | 40 | Operation failed |

## API

### Logger Instance

The module provides a pre-configured logger instance that all application modules should use.

### Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `set_level(level)` | level: string or int | Set logging verbosity |

### Logging Methods

| Method | Description |
|--------|-------------|
| `logger.debug(message)` | Log debug message |
| `logger.info(message)` | Log info message |
| `logger.warning(message)` | Log warning message |
| `logger.error(message)` | Log error message |

## Output Format

```
YYYY-MM-DD HH:MM:SS LEVEL    Message
```

Example:
```
2024-01-15 10:30:45 INFO     Application started
2024-01-15 10:30:45 INFO     HTTP server listening on port 8080
2024-01-15 10:30:46 DEBUG    Loading resource: data.json
```

## Behavior

### Initialization

The logger is initialized at module import with:
- Level: `INFO` (default)
- Output: `stderr`
- Format: timestamp, level, message

### Level Configuration

Level can be set via:
1. Function call: `set_level("DEBUG")`
2. String values: `"DEBUG"`, `"INFO"`, `"WARNING"`, `"ERROR"`
3. Integer values: `10`, `20`, `30`, `40`

### Thread Safety

Logging operations must be thread-safe for use in multi-threaded applications.

## Design Principles

- **Single instance**: One logger shared by all modules
- **No external dependencies**: Use only standard library
- **Foundation module**: No dependencies on other aide-frame modules

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [log.py](../python/logging.md) | Available |
| JavaScript | — | Planned |
