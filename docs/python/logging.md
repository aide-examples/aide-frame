# Logging (Python)

**Module:** `log.py` | [Spec](../spec/logging.md)

## Usage

```python
from aide_frame.log import logger, set_level

set_level("DEBUG")

logger.debug("Detailed info for debugging")
logger.info("Normal operation info")
logger.warning("Something unexpected but not fatal")
logger.error("Something went wrong")
```

## Exports

```python
from aide_frame.log import logger, set_level
```

- `logger` - Pre-configured `logging.Logger` instance
- `set_level(level)` - Set verbosity (`"DEBUG"`, `"INFO"`, `"WARNING"`, `"ERROR"` or int)

## Implementation Details

- Uses Python's built-in `logging` module
- Single `StreamHandler` writing to `stderr`
- Format: `%(asctime)s %(levelname)-8s %(message)s`
- Date format: `%Y-%m-%d %H:%M:%S`
