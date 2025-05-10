#!/bin/bash

# Exit on error
set -e

echo "🚀 Deploying worker..."
wrangler deploy

echo "📦 Running database migrations..."
wrangler d1 migrations apply chat_db

echo "✅ Deployment complete!" 