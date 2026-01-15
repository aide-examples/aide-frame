# Configuration (Python)

**Module:** `config.py` | [Spec](../spec/config.md)

## Usage

```python
from aide_frame.config import load_config

config = load_config("config.json", defaults={
    "port": 8080,
    "log_level": "INFO"
})

port = config.get("port", 8080)
```

## Exports

```python
from aide_frame.config import load_config
```

- `load_config(path, defaults=None)` - Load JSON config, deep-merge with defaults

## Deep Merge

```python
defaults = {"server": {"port": 8080, "host": "localhost"}}
# config.json: {"server": {"port": 3000}}

config = load_config("config.json", defaults=defaults)
# Result: {"server": {"port": 3000, "host": "localhost"}}
```

## Sample Config Pattern

```
app/
├── sample_config.json   # In repo (template)
└── config.json          # In .gitignore (user settings)
```

```gitignore
config.json
!sample_config.json
```

## Implementation Details

- Uses Python's `json` module
- Recursive merge for nested dicts
- Returns defaults if file not found
- Raises `json.JSONDecodeError` on invalid JSON
