"""
Platform detection and video driver configuration.

Detects the runtime platform (Raspberry Pi, WSL2, Linux desktop, macOS,
Windows, QNAP, Synology) and configures the appropriate SDL video driver.
"""

import os


def detect_platform():
    """
    Detect the runtime platform to configure appropriate drivers.

    Returns:
        str: One of 'raspi', 'wsl2', 'linux_desktop', 'macos', 'windows',
             'qnap', 'synology', 'unknown'
    """
    import platform

    system = platform.system().lower()

    if system == 'darwin':
        return 'macos'
    elif system == 'windows':
        return 'windows'
    elif system == 'linux':
        # NAS platforms: identified by their config file presence. Checked
        # before WSL/RPi/DRM heuristics — these systems are always headless
        # and pygame would be inappropriate even if /dev/dri exists.
        if os.path.exists('/etc/config/uLinux.conf'):
            return 'qnap'
        if os.path.exists('/etc/synoinfo.conf'):
            return 'synology'

        # Check for WSL2
        try:
            with open('/proc/version', 'r') as f:
                version_info = f.read().lower()
                if 'microsoft' in version_info or 'wsl' in version_info:
                    return 'wsl2'
        except:
            pass

        # Check for Raspberry Pi
        try:
            with open('/proc/device-tree/model', 'r') as f:
                model = f.read().lower()
                if 'raspberry pi' in model:
                    return 'raspi'
        except:
            pass

        # Check if we have kmsdrm capability (headless server or direct console)
        if os.path.exists('/dev/dri/card0'):
            # Could be raspi-like or a desktop with DRM
            # Check if we're running in a graphical session
            if os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'):
                return 'linux_desktop'
            else:
                # Running on console, might work with kmsdrm
                return 'raspi'

        return 'linux_desktop'

    return 'unknown'


def configure_video_driver(platform_type):
    """
    Configure SDL video driver based on detected platform.

    Args:
        platform_type: Result from detect_platform()

    Returns:
        dict: Configuration options for display initialization
    """
    config = {
        'fullscreen': True,
        'windowed_size': (1280, 720),  # Fallback for windowed mode
    }

    if platform_type == 'raspi':
        # Raspberry Pi: use kmsdrm for direct framebuffer access
        os.environ["SDL_VIDEODRIVER"] = "kmsdrm"
        os.environ["SDL_NOMOUSE"] = "1"
        os.environ["SDL_DRM_DEVICE"] = "/dev/dri/card0"
        config['driver'] = 'kmsdrm'
        print("Platform: Raspberry Pi - using kmsdrm driver")

    elif platform_type == 'wsl2':
        # WSL2: x11, even when WSLg offers Wayland — its EGL layer is broken there.
        #
        # WSLg sets WAYLAND_DISPLAY, and this used to prefer the wayland backend because of
        # it. That backend fails to initialise GL before a single frame is drawn. Measured
        # 2026-09-20 on a WSL2 box, in a twelve-line pygame program containing nothing but
        # `set_mode`:
        #
        #     SDL_VIDEODRIVER=wayland → libEGL: failed to get driver name for fd -1
        #                               MESA: error: ZINK: failed to choose pdev
        #                               libEGL: egl: failed to create dri2 screen
        #     SDL_VIDEODRIVER=x11     → not one warning
        #
        # A FotoFrame session died with `Segmentation fault (core dumped)` while the window
        # was being resized — VIDEORESIZE calls `set_mode` again, which is where SDL
        # recreates the GL surface and reaches into that layer. The crash could NOT be
        # reproduced programmatically (set_mode, convert, scale and blit all survive under
        # both drivers), so this is not PROVEN to be its cause; what is proven is that the
        # layer it fails in is absent under x11, and that x11 costs nothing here — WSLg
        # serves X11 as well, and the first comment in this branch chose it for that reason
        # before the wayland preference was added.
        #
        # An explicitly set SDL_VIDEODRIVER wins, so anyone wanting to compare can.
        os.environ["SDL_AUDIODRIVER"] = "dummy"   # ALSA errors otherwise
        driver = os.environ.get("SDL_VIDEODRIVER") or "x11"
        os.environ["SDL_VIDEODRIVER"] = driver
        config['driver'] = driver
        print(f"Platform: WSL2 - using {driver} driver")
        # In WSL2, we might want windowed mode for easier testing
        config['fullscreen'] = False

    elif platform_type == 'linux_desktop':
        # Linux desktop: prefer Wayland, fallback to X11
        if os.environ.get('WAYLAND_DISPLAY'):
            os.environ["SDL_VIDEODRIVER"] = "wayland"
            config['driver'] = 'wayland'
            print("Platform: Linux desktop - using Wayland driver")
        else:
            os.environ["SDL_VIDEODRIVER"] = "x11"
            config['driver'] = 'x11'
            print("Platform: Linux desktop - using X11 driver")
        config['fullscreen'] = False

    elif platform_type == 'macos':
        # macOS: use cocoa (default)
        os.environ["SDL_VIDEODRIVER"] = "cocoa"
        config['driver'] = 'cocoa'
        config['fullscreen'] = False
        print("Platform: macOS - using Cocoa driver")

    elif platform_type == 'windows':
        # Windows: use windows driver (default)
        os.environ["SDL_VIDEODRIVER"] = "windows"
        config['driver'] = 'windows'
        config['fullscreen'] = False
        print("Platform: Windows - using Windows driver")

    elif platform_type in ('qnap', 'synology'):
        # NAS platforms are always headless: no SDL driver, no window. The
        # marker tells callers to skip pygame entirely. Apps that still want
        # to force pygame here would have to set SDL_VIDEODRIVER themselves.
        config['fullscreen'] = False
        config['headless_recommended'] = True
        print(f"Platform: {platform_type.upper()} - headless (no SDL driver configured)")

    else:
        # Unknown: let SDL choose
        print(f"Platform: Unknown ({platform_type}) - using SDL default driver")
        config['fullscreen'] = False

    return config


# Detect platform and configure video driver at import time
# This MUST happen before pygame is imported elsewhere
PLATFORM = detect_platform()
VIDEO_CONFIG = configure_video_driver(PLATFORM)
