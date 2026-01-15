# Logging

**Module:** `log.py`

Python implementation of [Logging](../spec/logging.md).

## Usage

```python
from aide_frame.log import logger, set_level

# Set log level
set_level("DEBUG")

# Log messages
logger.debug("Detailed info for debugging")
logger.info("Normal operation info")
logger.warning("Something unexpected but not fatal")
logger.error("Something went wrong")
```

## API

```python
from aide_frame.log import logger, set_level
```

| Export | Type | Description |
|--------|------|-------------|
| `logger` | `logging.Logger` | Pre-configured logger instance |
| `set_level(level)` | function | Set logging verbosity |

### set_level()

```python
set_level("DEBUG")      # String
set_level(logging.INFO) # Integer constant
```

## Output Format

```
2024-01-15 10:30:45 INFO     Application started
2024-01-15 10:30:45 INFO     HTTP server listening on port 8080
2024-01-15 10:30:46 DEBUG    Loading resource: data.json
```

## Configuration

Set via command line argument (application-specific):

```bash
python3 main.py --log-level DEBUG
```

Or in code:

```python
from aide_frame.log import set_level
set_level("DEBUG")
```

## Implementation Details

- Uses Python's built-in `logging` module
- Single `StreamHandler` writing to `stderr`
- Format: `%(asctime)s %(levelname)-8s %(message)s`
- Date format: `%Y-%m-%d %H:%M:%S`
