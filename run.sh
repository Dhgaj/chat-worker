#!/bin/bash

echo "Installing dependencies..."
npm install

echo "Starting development server..."
npx wrangler dev --ip 0.0.0.0

echo "Done!"
