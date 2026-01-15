# Configuration

Loading and managing application configuration from JSON files.

## Purpose

Applications need flexible configuration:
- Load settings from JSON files
- Provide sensible defaults
- Deep merge user config with defaults
- Support the sample config pattern for safe updates

## Sample Config Pattern

To preserve user configurations during application updates:

| File | In Repository | Description |
|------|---------------|-------------|
| `sample_config.json` | Yes | Template with defaults and documentation |
| `config.json` | No (.gitignore) | User-specific configuration |

### Workflow

1. **Initial setup**: User copies `sample_config.json` to `config.json`
2. **Application update**: `sample_config.json` updated, `config.json` untouched
3. **New options**: User compares files and adds new settings as needed

## API

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `load_config(path, defaults)` | path: string, defaults: object (optional) | object | Load and merge configuration |

### Behavior

1. If file exists, load JSON content
2. Deep merge with defaults (user values override defaults)
3. If file doesn't exist, return defaults
4. Never throw on missing file

### Deep Merge

Nested objects are merged recursively:

```
defaults = { "a": { "x": 1, "y": 2 } }
user     = { "a": { "x": 5 } }
result   = { "a": { "x": 5, "y": 2 } }
```

Arrays are replaced, not merged.

## Configuration Structure

Configuration is application-specific. The framework provides loading mechanics; applications define their schema.

### Common Patterns

```json
{
    "feature_name": {
        "enabled": true,
        "setting1": "value",
        "setting2": 123
    }
}
```

### Path Values

Paths in configuration can be:
- **Relative**: Resolved against application directory
- **Absolute**: Used as-is

Path traversal (`..`) should be blocked by the application for security.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| File not found | Return defaults, no error |
| Invalid JSON | Throw parse error |
| Read permission denied | Throw IO error |

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [config.py](../python/config.md) | Available |
| JavaScript | — | Planned |
