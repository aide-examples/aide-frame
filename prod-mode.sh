#!/bin/bash
# Switch aide-frame to production mode (git submodule)
#
# Usage: Run from the app's root directory
#   ../aide-frame/prod-mode.sh [commit-or-tag]
#   OR
#   /home/gero/aide-examples/aide-frame/prod-mode.sh [commit-or-tag]
#
# If no commit/tag is specified, uses the current HEAD of aide-frame

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAME_DIR="$SCRIPT_DIR"
COMMIT="${1:-}"

# Detect app directory (where this script is called from)
APP_DIR="$(pwd)"

if [ "$APP_DIR" = "$FRAME_DIR" ]; then
    echo "Error: Run this script from an app directory, not from aide-frame"
    exit 1
fi

AIDE_FRAME_PATH="$APP_DIR/aide-frame"

# Get the commit to use
if [ -z "$COMMIT" ]; then
    COMMIT="$(git -C "$FRAME_DIR" rev-parse HEAD)"
    echo "Using current aide-frame HEAD: $COMMIT"
fi

echo "Switching to production mode..."
echo "  App: $APP_DIR"
echo "  Frame commit: $COMMIT"

# Remove existing aide-frame (symlink or directory)
if [ -L "$AIDE_FRAME_PATH" ]; then
    echo "  Removing symlink..."
    rm "$AIDE_FRAME_PATH"
elif [ -d "$AIDE_FRAME_PATH" ]; then
    echo "  Removing existing directory..."
    rm -rf "$AIDE_FRAME_PATH"
fi

# Remove from .gitignore if present
if grep -q "^aide-frame$" "$APP_DIR/.gitignore" 2>/dev/null; then
    grep -v "^aide-frame$" "$APP_DIR/.gitignore" > "$APP_DIR/.gitignore.tmp"
    mv "$APP_DIR/.gitignore.tmp" "$APP_DIR/.gitignore"
    echo "  Removed aide-frame from .gitignore"
fi

# Clean up old submodule state if present
git -C "$APP_DIR" submodule deinit -f aide-frame 2>/dev/null || true
rm -rf "$APP_DIR/.git/modules/aide-frame" 2>/dev/null || true
git -C "$APP_DIR" rm -f --cached aide-frame 2>/dev/null || true
# Remove directory that might be left over after git rm
rm -rf "$AIDE_FRAME_PATH" 2>/dev/null || true

# Add as submodule from GitHub
SUBMODULE_URL="https://github.com/aide-examples/aide-frame.git"

git -C "$APP_DIR" submodule add "$SUBMODULE_URL" aide-frame
git -C "$APP_DIR/aide-frame" checkout "$COMMIT"

echo ""
echo "Production mode enabled!"
echo "  aide-frame @ $COMMIT (submodule)"
echo ""
echo "To update aide-frame version:"
echo "  cd aide-frame && git checkout <new-commit> && cd .."
echo "  git add aide-frame && git commit -m 'Update aide-frame'"
