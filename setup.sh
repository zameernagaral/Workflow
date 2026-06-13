#!/bin/bash

# Setup script for the Meeting Automation Engine
echo "=================================================="
echo "🚀 Setting up the Meeting Automation Engine..."
echo "=================================================="

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js (version 18+)."
    exit 1
fi
echo "✅ Node.js is installed: $(node -v)"

# Check npm installation
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    exit 1
fi
echo "✅ npm is installed: $(npm -v)"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Error: Dependency installation failed."
    exit 1
fi
echo "✅ Dependencies installed successfully."

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️ Warning: .env file not found. Copying .env.example..."
    cp .env.example .env
    echo "📝 Please fill in your API credentials in the newly created .env file."
else
    echo "✅ .env file found."
fi

# Verify credentials file exists if configured
if grep -q "GOOGLE_APPLICATION_CREDENTIALS" .env; then
    CREDS_PATH=$(grep "GOOGLE_APPLICATION_CREDENTIALS" .env | cut -d '=' -f2)
    if [ -f "$CREDS_PATH" ] || [ -f "./google-credentials.json" ]; then
        echo "✅ Google Cloud Credentials file detected."
    else
        echo "⚠️ Warning: Google Cloud Credentials file specified in .env not found at path: $CREDS_PATH"
        echo "   Please make sure to place your Google service account JSON key file in the workspace."
    fi
fi

echo "=================================================="
echo "🎉 Setup Complete!"
echo "To create a meeting space, run:"
echo "  npm run create-meeting"
echo ""
echo "To start the webhook server and polling engine, run:"
echo "  npm start"
echo "=================================================="
