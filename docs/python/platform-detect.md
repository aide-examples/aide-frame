# Platform Detection (Python)

**Module:** `platform_detect.py`

Python implementation of [Platform Detection](../spec/platform-detect.md).

## Usage

```python
from aide_frame.platform_detect import is_raspberry_pi, is_wsl2, get_platform_info

if is_raspberry_pi():
    # Production: fullscreen, real hardware
    os.environ['SDL_VIDEODRIVER'] = 'kmsdrm'
    screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
else:
    # Development: windowed mode
    screen = pygame.display.set_mode((1280, 720))
```

## API

```python
from aide_frame.platform_detect import is_raspberry_pi, is_wsl2, get_platform_info
```

| Function | Returns | Description |
|----------|---------|-------------|
| `is_raspberry_pi()` | `bool` | True if running on Raspberry Pi |
| `is_wsl2()` | `bool` | True if running in WSL2 |
| `get_platform_info()` | `dict` | Detailed platform information |

### get_platform_info() Response

```python
{
    "platform": "raspi",      # or "wsl2", "linux", "macos", "windows"
    "is_raspberry_pi": True,
    "is_wsl2": False,
    "os": "Linux",
    "arch": "aarch64"
}
```

## Implementation Details

Detection sources:
- `/proc/device-tree/model` - contains "Raspberry Pi" on Pi hardware
- `/proc/version` - contains "microsoft" on WSL2
- `platform.system()` - OS detection
- `platform.machine()` - architecture detection

Results are cached in module-level variables after first call.

## Performance

- **Startup:** ~1-2ms one-time cost (reads two small `/proc` files)
- **Memory:** <1KB (cached in global variables)
- **Runtime:** No impact (detection runs once at startup)
