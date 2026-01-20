#!/bin/bash
# Build a release archive with aide-frame as submodule (not symlink)
#
# Usage: Run from the app's root directory
#   ../aide-frame/build-release.sh [format] [commit-or-tag]
#
# Arguments:
#   format        - "tar" (default), "zip", or "both"
#   commit-or-tag - aide-frame commit to use (default: current HEAD)
#
# Examples:
#   ../aide-frame/build-release.sh           # Creates .tar.gz
#   ../aide-frame/build-release.sh zip       # Creates .zip
#   ../aide-frame/build-release.sh both v1.0 # Creates both at aide-frame v1.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAME_DIR="$SCRIPT_DIR"
FORMAT="${1:-tar}"
COMMIT="${2:-}"

# Detect app directory (where this script is called from)
APP_DIR="$(pwd)"
APP_NAME="$(basename "$APP_DIR")"

if [ "$APP_DIR" = "$FRAME_DIR" ]; then
    echo "Error: Run this script from an app directory, not from aide-frame"
    exit 1
fi

# Validate format
if [ "$FORMAT" != "tar" ] && [ "$FORMAT" != "zip" ] && [ "$FORMAT" != "both" ]; then
    echo "Error: format must be 'tar', 'zip', or 'both'"
    exit 1
fi

AIDE_FRAME_PATH="$APP_DIR/aide-frame"
WAS_DEV_MODE=false

# Check if currently in dev mode (symlink)
if [ -L "$AIDE_FRAME_PATH" ]; then
    WAS_DEV_MODE=true
    echo "Currently in dev mode (symlink). Switching to prod mode for archive..."
fi

# Get version from app/VERSION if it exists
VERSION=""
if [ -f "$APP_DIR/app/VERSION" ]; then
    VERSION="-$(cat "$APP_DIR/app/VERSION" | tr -d '[:space:]')"
fi

# Create releases directory
mkdir -p "$APP_DIR/releases"

# Switch to prod mode if needed
if [ "$WAS_DEV_MODE" = true ]; then
    "$FRAME_DIR/prod-mode.sh" $COMMIT
fi

# Build archive name
ARCHIVE_BASE="$APP_DIR/releases/${APP_NAME}${VERSION}"

echo ""
echo "Creating release archive(s)..."

# Create tar.gz
if [ "$FORMAT" = "tar" ] || [ "$FORMAT" = "both" ]; then
    ARCHIVE_FILE="${ARCHIVE_BASE}.tar.gz"
    echo "  Creating $ARCHIVE_FILE..."

    # Create tar from parent directory to include app folder name
    tar -czf "$ARCHIVE_FILE" \
        --exclude='releases' \
        --exclude='node_modules' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.DS_Store' \
        --exclude='deploy' \
        -C "$(dirname "$APP_DIR")" \
        "$APP_NAME"

    echo "  Created: $ARCHIVE_FILE"
fi

# Create zip
if [ "$FORMAT" = "zip" ] || [ "$FORMAT" = "both" ]; then
    ARCHIVE_FILE="${ARCHIVE_BASE}.zip"
    echo "  Creating $ARCHIVE_FILE..."

    # Create zip from parent directory
    (cd "$(dirname "$APP_DIR")" && zip -rq "$ARCHIVE_FILE" "$APP_NAME" \
        -x '*/releases/*' \
        -x '*/node_modules/*' \
        -x '*/__pycache__/*' \
        -x '*.pyc' \
        -x '*.DS_Store' \
        -x '*/deploy/*')

    echo "  Created: $ARCHIVE_FILE"
fi

# Switch back to dev mode if we were in it
if [ "$WAS_DEV_MODE" = true ]; then
    echo ""
    echo "Switching back to dev mode..."
    "$FRAME_DIR/dev-mode.sh"
fi

echo ""
echo "Release build complete!"
echo "Archive(s) in: $APP_DIR/releases/"
ls -la "$APP_DIR/releases/"
