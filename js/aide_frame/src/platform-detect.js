/**
 * Platform detection and video driver configuration.
 *
 * Detects the runtime platform (Raspberry Pi, WSL2, Linux desktop, macOS, Windows)
 * and configures the appropriate SDL video driver.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Detect the runtime platform to configure appropriate drivers.
 * @returns {string} One of 'raspi', 'wsl2', 'linux_desktop', 'macos', 'windows'
 */
function detectPlatform() {
    const platform = os.platform();

    if (platform === 'darwin') {
        return 'macos';
    } else if (platform === 'win32') {
        return 'windows';
    } else if (platform === 'linux') {
        // Check for WSL2
        try {
            const versionInfo = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
            if (versionInfo.includes('microsoft') || versionInfo.includes('wsl')) {
                return 'wsl2';
            }
        } catch (e) {
            // Ignore errors
        }

        // Check for Raspberry Pi
        try {
            const model = fs.readFileSync('/proc/device-tree/model', 'utf8').toLowerCase();
            if (model.includes('raspberry pi')) {
                return 'raspi';
            }
        } catch (e) {
            // Ignore errors
        }

        // Check if we have kmsdrm capability (headless server or direct console)
        if (fs.existsSync('/dev/dri/card0')) {
            // Could be raspi-like or a desktop with DRM
            // Check if we're running in a graphical session
            if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
                return 'linux_desktop';
            } else {
                // Running on console, might work with kmsdrm
                return 'raspi';
            }
        }

        return 'linux_desktop';
    }

    return 'unknown';
}

/**
 * Configure SDL video driver based on detected platform.
 * @param {string} platformType - Result from detectPlatform()
 * @returns {object} Configuration options for display initialization
 */
function configureVideoDriver(platformType) {
    const config = {
        fullscreen: true,
        windowedSize: [1280, 720], // Fallback for windowed mode
    };

    if (platformType === 'raspi') {
        // Raspberry Pi: use kmsdrm for direct framebuffer access
        process.env.SDL_VIDEODRIVER = 'kmsdrm';
        process.env.SDL_NOMOUSE = '1';
        process.env.SDL_DRM_DEVICE = '/dev/dri/card0';
        config.driver = 'kmsdrm';
        console.log('Platform: Raspberry Pi - using kmsdrm driver');

    } else if (platformType === 'wsl2') {
        // WSL2: use x11 (requires X server like VcXsrv or WSLg)
        // WSLg provides built-in Wayland/X11 support in Windows 11
        // Disable audio on WSL2 (ALSA errors)
        process.env.SDL_AUDIODRIVER = 'dummy';
        if (process.env.WAYLAND_DISPLAY) {
            process.env.SDL_VIDEODRIVER = 'wayland';
            config.driver = 'wayland';
            console.log('Platform: WSL2 - using Wayland driver (WSLg)');
        } else {
            process.env.SDL_VIDEODRIVER = 'x11';
            config.driver = 'x11';
            console.log('Platform: WSL2 - using X11 driver');
        }
        // In WSL2, we might want windowed mode for easier testing
        config.fullscreen = false;

    } else if (platformType === 'linux_desktop') {
        // Linux desktop: prefer Wayland, fallback to X11
        if (process.env.WAYLAND_DISPLAY) {
            process.env.SDL_VIDEODRIVER = 'wayland';
            config.driver = 'wayland';
            console.log('Platform: Linux desktop - using Wayland driver');
        } else {
            process.env.SDL_VIDEODRIVER = 'x11';
            config.driver = 'x11';
            console.log('Platform: Linux desktop - using X11 driver');
        }
        config.fullscreen = false;

    } else if (platformType === 'macos') {
        // macOS: use cocoa (default)
        process.env.SDL_VIDEODRIVER = 'cocoa';
        config.driver = 'cocoa';
        config.fullscreen = false;
        console.log('Platform: macOS - using Cocoa driver');

    } else if (platformType === 'windows') {
        // Windows: use windows driver (default)
        process.env.SDL_VIDEODRIVER = 'windows';
        config.driver = 'windows';
        config.fullscreen = false;
        console.log('Platform: Windows - using Windows driver');

    } else {
        // Unknown: let SDL choose
        console.log(`Platform: Unknown (${platformType}) - using SDL default driver`);
        config.fullscreen = false;
    }

    return config;
}

/**
 * Describe the MACHINE, for a human reading a footer — not the driver to use.
 *
 * `detectPlatform()` above answers a different question: *which SDL video driver*. Its
 * `'raspi'` means "kmsdrm, no X server", and the branch that returns it fires for any
 * headless Linux with a `/dev/dri/card0` — an Intel mini-PC serving web pages reaches
 * it exactly as a Pi does. That answer is right for the driver and wrong for a label,
 * and the status payload was passing it straight through to the version tooltip: a
 * Lenovo ThinkCentre under Debian 13 announced itself as `platform: raspi`
 * (measured on semeb.de/devicemgr, 2026-10-20).
 *
 * So the two readings get two functions. This one names the hardware where the hardware
 * says so (`/proc/device-tree/model`, which only a device tree has) and otherwise names
 * the distribution and the architecture, which is what somebody looking at a footer
 * wants to know. Nothing branches on the result — it is text for a person.
 *
 * @returns {string} e.g. "Raspberry Pi Zero 2 W", "Debian GNU/Linux 13 (trixie) · x64",
 *                   "WSL2 (Ubuntu) · x64", "macOS 14.5 · arm64"
 */
function describeMachine() {
    const arch = os.arch();
    const platform = os.platform();

    if (platform === 'darwin') return `macOS ${os.release()} · ${arch}`;
    if (platform === 'win32') return `Windows ${os.release()} · ${arch}`;
    if (platform !== 'linux') return `${platform} ${os.release()} · ${arch}`;

    // A device tree is the one place a board states its own model, and only boards have
    // one — so a hit here IS the hardware, not a guess from it. The file is NUL-padded.
    try {
        const model = fs.readFileSync('/proc/device-tree/model', 'utf8').replace(/\0/g, '').trim();
        if (model) return model;
    } catch (e) { /* not a board — fall through to the distribution */ }

    let distro = 'Linux';
    try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        const m = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
        if (m) distro = m[1];
    } catch (e) { /* no /etc/os-release — keep the generic name */ }

    // WSL is worth saying out loud: the distribution alone would read as bare metal.
    try {
        const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        if (version.includes('microsoft') || version.includes('wsl')) distro += ' · WSL2';
    } catch (e) { /* ignore */ }

    return `${distro} · ${arch}`;
}

// Detect platform and configure video driver at require time
const PLATFORM = detectPlatform();
const VIDEO_CONFIG = configureVideoDriver(PLATFORM);
const MACHINE = describeMachine();

module.exports = {
    detectPlatform,
    configureVideoDriver,
    describeMachine,
    PLATFORM,
    VIDEO_CONFIG,
    MACHINE,
};
