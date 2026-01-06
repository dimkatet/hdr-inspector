#!/bin/bash
# Deploy script for HDR Inspector
# Builds the project and deploys to /var/www/hdr-inspector/

set -e  # Exit on error

echo "🔨 Installing dependencies..."
pnpm i

echo "🏗️  Building project..."
pnpm build

echo "📦 Deploying to /var/www/hdr-inspector/..."
rm -rf /var/www/hdr-inspector/*
cp -r ./dist/* /var/www/hdr-inspector/

echo "🔄 Restarting Caddy..."
systemctl restart caddy

echo "✅ Deployment complete!"
echo "🌐 Your site should now be live"
