# Platform Detection (Python)

**Module:** `platform_detect.py` | [Spec](../spec/platform-detect.md)

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

## Exports

```python
from aide_frame.platform_detect import is_raspberry_pi, is_wsl2, get_platform_info
```

- `is_raspberry_pi()` - Returns `True` on Raspberry Pi hardware
- `is_wsl2()` - Returns `True` in WSL2 environment
- `get_platform_info()` - Returns dict with `platform`, `is_raspberry_pi`, `is_wsl2`, `os`, `arch`

## Implementation Details

Detection sources:
- `/proc/device-tree/model` - contains "Raspberry Pi" on Pi hardware
- `/proc/version` - contains "microsoft" on WSL2
- `platform.system()` / `platform.machine()` - OS and architecture

Results cached after first call (~1-2ms initial cost).
