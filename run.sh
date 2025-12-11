#!/bin/bash

echo "Installing dependencies..."
npm install
echo "Installed dependencies successfully"

echo "Starting development server..."
npx wrangler dev --ip 0.0.0.0

echo "Done!"
