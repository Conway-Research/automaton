#!/usr/bin/env bash
# Seed Moat Control Plane with Automaton capabilities.
# Run after `docker compose up -d` when control-plane is healthy.
#
# Usage: bash scripts/seed-capabilities.sh

set -euo pipefail

CP="http://localhost:8001"

echo "Seeding capabilities in Moat Control Plane at ${CP}..."

register() {
  local name="$1" desc="$2" provider="$3" version="${4:-1.0.0}"
  echo -n "  ${name}... "
  http_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${CP}/capabilities" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${name}\",
      \"description\": \"${desc}\",
      \"provider\": \"${provider}\",
      \"version\": \"${version}\",
      \"tags\": [\"automaton\"],
      \"status\": \"active\"
    }")
  if [ "$http_code" = "201" ]; then
    echo "OK (201)"
  elif [ "$http_code" = "409" ]; then
    echo "exists (409)"
  else
    echo "FAILED (${http_code})"
  fi
}

# GWI code services (local CLI adapter)
register "gwi.triage"        "Score PR complexity (1-10)"          "local-cli"
register "gwi.review"        "Generate review summary for PR"      "local-cli"
register "gwi.issue-to-code" "Generate PR from GitHub issue"       "local-cli"
register "gwi.resolve"       "Resolve merge conflicts in PR"       "local-cli"

# External API proxies
register "github.api"         "GitHub REST API access"             "github"
register "openai.inference"   "OpenAI model inference"             "openai"
register "irsb.receipt"       "IRSB on-chain receipt submission"   "irsb-sepolia"

# Generic HTTPS proxy (domain-allowlisted)
register "http.proxy"         "Generic HTTPS proxy with domain allowlist" "http_proxy"

echo ""
echo "Verifying registration..."
curl -s "${CP}/capabilities" | python3 -m json.tool 2>/dev/null || curl -s "${CP}/capabilities"
echo ""
echo "Done. ${CP}/capabilities lists all registered capabilities."
