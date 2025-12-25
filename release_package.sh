#!/bin/bash

# Definition
EXT_NAME="ai_council_extension"
VERSION=$(grep '"version":' manifest.json | cut -d '"' -f 4)
ZIP_NAME="${EXT_NAME}_v${VERSION}.zip"

echo "📦 Packaging $EXT_NAME v$VERSION..."

# Remove old zip
rm -f *.zip

# Zip files
# Excludes: .git, .gemini (artifacts), node_modules, and the script itself
zip -r "$ZIP_NAME" . -x "*.git*" -x "*.gemini*" -x "release_package.sh" -x "DEPLOYMENT.md" -x "*.DS_Store*"

echo "✅ Created: $ZIP_NAME"
echo "You can now upload this file to the Chrome Web Store."
