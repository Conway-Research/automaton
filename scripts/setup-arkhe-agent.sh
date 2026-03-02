#!/bin/bash
# setup-arkhe-agent.sh - Setup and configure an Arkhe-Automaton agent

# Check dependencies
if ! command -v arkhecli &> /dev/null; then
    echo "Error: arkhecli not found. Please install the Arkhe CLI."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq not found. Please install jq."
    exit 1
fi

# Create agent account
echo "Creating agent account..."
AGENT_JSON=$(arkhecli keys add agent-001 --output json)
AGENT_MNEMONIC=$(echo $AGENT_JSON | jq -r '.mnemonic')
AGENT_ADDRESS=$(arkhecli keys show agent-001 -a)

echo "Agent Address: $AGENT_ADDRESS"

# Fund agent
echo "Funding agent from architect..."
arkhecli tx bank send architect $AGENT_ADDRESS 100000000uarkhe --yes

# Configure Automaton
echo "Writing agent-config.json..."
cat > agent-config.json <<EOF
{
  "arkheRPC": "http://localhost:26657",
  "arkheMnemonic": "$AGENT_MNEMONIC",
  "arkheChainId": "arkhe-testnet-1"
}
EOF

echo "Setup complete. Start the automaton with: node dist/arkhe-automaton.js"
