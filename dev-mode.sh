#!/bin/bash
# Switch aide-frame to development mode (symlink)
#
# Usage: Run from the app's root directory
#   ../aide-frame/dev-mode.sh
#   OR
#   /home/gero/aide-examples/aide-frame/dev-mode.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAME_DIR="$SCRIPT_DIR"

# Detect app directory (where this script is called from)
APP_DIR="$(pwd)"

if [ "$APP_DIR" = "$FRAME_DIR" ]; then
    echo "Error: Run this script from an app directory, not from aide-frame"
    exit 1
fi

AIDE_FRAME_PATH="$APP_DIR/aide-frame"

echo "Switching to development mode..."
echo "  App: $APP_DIR"
echo "  Frame: $FRAME_DIR"

# Clean up git submodule state if present
if [ -f "$APP_DIR/.gitmodules" ] && grep -q aide-frame "$APP_DIR/.gitmodules" 2>/dev/null; then
    echo "  Cleaning up git submodule..."
    git -C "$APP_DIR" submodule deinit -f aide-frame 2>/dev/null || true
    git -C "$APP_DIR" rm -f aide-frame 2>/dev/null || true
    rm -rf "$APP_DIR/.git/modules/aide-frame" 2>/dev/null || true
fi

# Remove existing aide-frame (submodule directory or symlink)
if [ -L "$AIDE_FRAME_PATH" ]; then
    echo "  Removing existing symlink..."
    rm "$AIDE_FRAME_PATH"
elif [ -d "$AIDE_FRAME_PATH" ]; then
    echo "  Removing existing directory..."
    rm -rf "$AIDE_FRAME_PATH"
fi

# Create symlink
ln -s "$FRAME_DIR" "$AIDE_FRAME_PATH"

# Add to .gitignore if not already there
if ! grep -q "^aide-frame$" "$APP_DIR/.gitignore" 2>/dev/null; then
    echo "aide-frame" >> "$APP_DIR/.gitignore"
    echo "  Added aide-frame to .gitignore"
fi

echo ""
echo "Development mode enabled!"
echo "  aide-frame -> $FRAME_DIR (symlink)"
echo ""
echo "Changes to aide-frame are now immediately visible."
