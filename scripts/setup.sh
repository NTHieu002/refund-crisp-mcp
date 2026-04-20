#!/usr/bin/env bash
#
# One-shot setup for the PageFly Refund MCP Server on a fresh Debian/Ubuntu VPS.
#
# Usage:
#   1. Clone the repo into /opt/mcp/refund
#   2. Create /opt/mcp/refund/.env with TURSO_DATABASE_URL + TURSO_AUTH_TOKEN + PORT
#   3. Run: bash scripts/setup.sh
#
# Idempotent — safe to re-run after `git pull`.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="refund-mcp"

echo "── Setup for ${APP_NAME} in ${REPO_DIR} ──"

# ------------------------------------------------------------------
# Install OS packages
# ------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "→ Installing Node.js 24 via NodeSource"
  apt-get update -y
  apt-get install -y git build-essential curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
else
  echo "→ Node already installed ($(node -v))"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "→ Installing PM2"
  npm install -g pm2
else
  echo "→ PM2 already installed ($(pm2 -v))"
fi

# ------------------------------------------------------------------
# Ensure .env exists
# ------------------------------------------------------------------
cd "${REPO_DIR}"

if [ ! -f .env ]; then
  echo ""
  echo "❌ .env not found in ${REPO_DIR}"
  echo ""
  echo "Create it first with:"
  echo ""
  echo "  cat > ${REPO_DIR}/.env << 'EOF'"
  echo "  TURSO_DATABASE_URL=libsql://<your-db>.turso.io"
  echo "  TURSO_AUTH_TOKEN=<your-token>"
  echo "  PORT=3000"
  echo "  EOF"
  echo ""
  exit 1
fi

chmod 600 .env

# ------------------------------------------------------------------
# Install deps + build
# ------------------------------------------------------------------
echo "→ npm ci"
npm ci

echo "→ npm run build"
npm run build

# ------------------------------------------------------------------
# Start / reload PM2
# ------------------------------------------------------------------
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "→ Reloading existing PM2 process"
  pm2 reload "${APP_NAME}"
else
  echo "→ Starting new PM2 process"
  pm2 start npm --name "${APP_NAME}" -- run start
fi

pm2 save

# Register systemd unit the first time only
if [ ! -f /etc/systemd/system/pm2-root.service ]; then
  echo "→ Registering PM2 as a systemd service"
  pm2 startup systemd -u root --hp /root | tail -1 | bash || true
fi

# ------------------------------------------------------------------
# Verify
# ------------------------------------------------------------------
sleep 2

echo ""
echo "── Health check ──"
curl -fsS http://localhost:3000/health && echo " ← server OK"
echo ""
pm2 status
echo ""
echo "✓ Done. MCP is running on http://localhost:3000"
echo "  Next: expose with Caddy on ports 80/443 once a domain is ready."
