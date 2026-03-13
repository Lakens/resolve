#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "================================================"
echo " QuartoReview Desktop - First-time setup"
echo "================================================"
echo ""

# Check that Node.js is installed
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js is not installed."
    echo ""
    echo "Please install Node.js from: https://nodejs.org"
    echo "Choose the LTS version."
    echo "Then run this script again."
    exit 1
fi

echo "Node.js found: $(node --version)"
echo ""

cd "$SCRIPT_DIR"
echo "Installing desktop, backend, and frontend dependencies..."
npm run install:all

echo ""
echo "================================================"
echo " Installation complete!"
echo "================================================"
echo ""
echo "Next step: run ./start.sh once."
echo "The desktop app will create a template config file in:"
echo "  ~/Library/Application Support/QuartoReview/.env"
echo "Fill that file with either a GitHub token or OAuth credentials."
echo ""
echo "Then run ./start.sh again to launch the desktop app."
echo ""
