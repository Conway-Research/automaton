#!/bin/bash
# nordvpn-twitter.sh — Connect NordVPN for Twitter access (fallback for twitterapi.io)
#
# Primary Twitter posting: twitterapi.io API
# This script is the fallback when the account is locked (HTTP 326).
#
# Usage: ./scripts/nordvpn-twitter.sh
set -euo pipefail

echo "=== NordVPN Twitter Fallback ==="

# Connect via NordLynx (WireGuard-based, faster)
nordvpn set technology nordlynx
nordvpn connect United_States

echo ""
echo "=== Post-connect health checks ==="

# Verify critical services survive VPN routing
echo -n "Cloudflare tunnel... "
curl -sf https://compintel.co/health > /dev/null && echo "OK" || echo "FAIL — consider split tunneling"

echo -n "Base RPC... "
if [ -n "${BASE_RPC_URL:-}" ]; then
  curl -sf -X POST "${BASE_RPC_URL}" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null && echo "OK" || echo "FAIL"
else
  echo "SKIP (BASE_RPC_URL not set)"
fi

echo -n "Local API... "
curl -sf http://localhost:8081/health > /dev/null && echo "OK" || echo "FAIL"

echo ""
echo "If any check failed, configure split tunneling:"
echo "  nordvpn set splitTunneling on"
echo "  nordvpn whitelist add process node"
echo "  nordvpn whitelist add process cloudflared"
