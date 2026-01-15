# Configuration (Python)

**Module:** `config.py`

Python implementation of [Configuration](../spec/config.md).

## Usage

```python
from aide_frame.config import load_config

# Load with defaults
config = load_config("config.json", defaults={
    "port": 8080,
    "log_level": "INFO"
})

# Access settings
port = config.get("port", 8080)
```

## API

```python
from aide_frame.config import load_config
```

| Function | Parameters | Returns |
|----------|------------|---------|
| `load_config(path, defaults=None)` | path: str, defaults: dict | dict |

### Deep Merge

```python
defaults = {"server": {"port": 8080, "host": "localhost"}}
# config.json: {"server": {"port": 3000}}

config = load_config("config.json", defaults=defaults)
# Result: {"server": {"port": 3000, "host": "localhost"}}
```

## Sample Config Pattern

```python
import os
from aide_frame.config import load_config

config_path = os.path.join(APP_DIR, 'config.json')
if not os.path.exists(config_path):
    print("No config.json found. Copy sample_config.json to config.json")

config = load_config(config_path, defaults=DEFAULT_CONFIG)
```

### .gitignore

```
# User config (not tracked)
config.json

# Sample config IS tracked
!sample_config.json
```

## Example Configuration

```json
{
    "port": 8080,
    "log_level": "INFO",

    "feature": {
        "enabled": true,
        "timeout": 30
    }
}
```

## Implementation Details

- Uses Python's `json` module
- Recursive merge for nested dicts
- Returns empty dict if file not found and no defaults provided
- Raises `json.JSONDecodeError` on invalid JSON
