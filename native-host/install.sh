#!/bin/bash

# Install script for Browser Control MCP native messaging host
# This script sets up the native messaging host for Firefox

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="browser_control_mcp_host"

# Build the native host first
echo "Building native messaging host..."
cd "$SCRIPT_DIR"
npm install
npm run build

# Get the path to the built host
HOST_PATH="$SCRIPT_DIR/dist/host.js"

# Determine the native messaging directory based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    NM_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    NM_DIR="$HOME/.mozilla/native-messaging-hosts"
else
    echo "Unsupported operating system: $OSTYPE"
    echo "Please manually install the native messaging host."
    exit 1
fi

# Create the native messaging directory if it doesn't exist
mkdir -p "$NM_DIR"

# Create the manifest with the correct path
MANIFEST_PATH="$NM_DIR/${HOST_NAME}.json"

cat > "$MANIFEST_PATH" << EOF
{
  "name": "${HOST_NAME}",
  "description": "Native messaging host for Browser Control MCP extension",
  "path": "${HOST_PATH}",
  "type": "stdio",
  "allowed_extensions": [
    "browser-control-mcp@anthropic.com"
  ]
}
EOF

echo ""
echo "Native messaging host installed successfully!"
echo ""
echo "Manifest location: $MANIFEST_PATH"
echo "Host location: $HOST_PATH"
echo ""
echo "Please restart Firefox for the changes to take effect."
