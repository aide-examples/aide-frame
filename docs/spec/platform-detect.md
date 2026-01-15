# Platform Detection (Spec)

Detecting the runtime environment to adapt application behavior.

## Purpose

Applications need to run on both production hardware (Raspberry Pi) and development machines. Platform detection provides information about the current environment, enabling:

- Appropriate display modes (fullscreen vs. windowed)
- Hardware feature availability (GPIO, CEC)
- Driver selection
- Conditional functionality

## Platforms

| Platform | Identifier | Typical Use |
|----------|------------|-------------|
| Raspberry Pi | `raspi` | Production deployment |
| WSL2 | `wsl2` | Windows development |
| Linux Desktop | `linux` | Linux development |
| macOS | `macos` | Mac development |
| Windows | `windows` | Native Windows |

## API

### Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `is_raspberry_pi()` | bool | True if running on Raspberry Pi hardware |
| `is_wsl2()` | bool | True if running in Windows Subsystem for Linux 2 |
| `get_platform_info()` | object | Detailed platform information |

### Platform Info Object

`get_platform_info()` returns an object with:

| Field | Type | Description |
|-------|------|-------------|
| `platform` | string | Platform identifier (see table above) |
| `is_raspberry_pi` | bool | Raspberry Pi hardware |
| `is_wsl2` | bool | WSL2 environment |
| `os` | string | Operating system name |
| `arch` | string | CPU architecture |

## Behavior

### Detection Methods

1. **Raspberry Pi**: Check for device tree model file containing "Raspberry Pi"
2. **WSL2**: Check kernel version string for "microsoft" identifier
3. **OS**: Use standard platform detection

### Caching

Detection runs once at first call. Results are cached for subsequent calls.

### Error Handling

If detection files are unreadable, assume non-Raspberry Pi environment. Never throw exceptions from detection functions.

## Platform Capabilities

| Capability | Raspberry Pi | WSL2 | Linux | macOS | Windows |
|------------|--------------|------|-------|-------|---------|
| GPIO | Yes | No | No | No | No |
| HDMI-CEC | Yes | No | Rare | No | No |
| kmsdrm video | Yes | No | Possible | No | No |
| Fullscreen recommended | Yes | No | No | No | No |

## Implementations

| Language | Module | Status |
|----------|--------|--------|
| Python | [platform_detect.py](../python/platform-detect.md) | Available |
| JavaScript | — | Planned |
