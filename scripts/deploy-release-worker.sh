#!/usr/bin/env bash
# ==============================================================================
# Inaayah Studio — Free Cloudflare Edge Release Gateway Deployment Script
# Deploys the caching proxy for game manifests and GitHub Releases.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "${SCRIPT_DIR}/../worker" && pwd)"

echo "=========================================================="
echo "🚀 Inaayah Studio: Deploying Release Gateway Worker"
echo "=========================================================="

cd "${WORKER_DIR}"

# 1. Verify wrangler
if ! npx --yes wrangler --version > /dev/null 2>&1; then
  echo "❌ Error: Could not execute wrangler. Please check internet connection."
  exit 1
fi

echo "✅ Wrangler CLI detected: $(npx wrangler --version)"

# 2. Check if user is logged into Cloudflare
echo "🔑 Checking Cloudflare authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
  echo "⚠️ You are not logged into Cloudflare."
  echo "👉 Opening Cloudflare login prompt..."
  npx wrangler login
fi

# 3. Optional: Set or update GitHub Token secret
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "🔐 Setting GITHUB_TOKEN secret from environment variable..."
  echo "${GITHUB_TOKEN}" | npx wrangler secret put GITHUB_TOKEN
else
  echo ""
  echo "ℹ️ Note: If this is your first deployment or your private repo token changed,"
  echo "   run the following command to store your GitHub Read-Only token securely:"
  echo "     cd worker && npx wrangler secret put GITHUB_TOKEN"
  echo ""
fi

# 4. Deploy worker
echo "📦 Deploying worker to Cloudflare Edge Network (Free Tier)..."
DEPLOY_OUTPUT=$(npx wrangler deploy)
echo "${DEPLOY_OUTPUT}"

echo "=========================================================="
echo "🎉 Deployment Complete!"
echo "Your edge gateway is now caching game manifests & releases."
echo "=========================================================="
