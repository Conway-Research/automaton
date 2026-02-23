/**
 * Agent Card
 *
 * Generates and manages the agent's self-description card.
 * This is the JSON document pointed to by the ERC-8004 agentURI.
 * Can be hosted on IPFS or served at /.well-known/agent-card.json
 *
 * Phase 3.2: Fixed code injection in hostAgentCard (S-P0-3),
 * removed internal details from card (S-P1-10),
 * added CORS headers and Content-Type.
 */
const AGENT_CARD_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
/**
 * Generate an agent card from the automaton's current state.
 *
 * Phase 3.2: Only expose agentWallet service, name, generic description,
 * x402Support, and active status. Do NOT include:
 * - Conway API URL (internal infrastructure)
 * - Sandbox ID (internal identifier)
 * - Creator address (privacy)
 */
export function generateAgentCard(identity, config, _db) {
    // Phase 3.2: Only expose agentWallet service
    const services = [
        {
            name: "agentWallet",
            endpoint: `eip155:8453:${identity.address}`,
        },
    ];
    // Phase 3.2: Generic description, no internal details
    const description = `Autonomous agent: ${config.name}`;
    return {
        type: AGENT_CARD_TYPE,
        name: config.name,
        description,
        services,
        x402Support: true,
        active: true,
    };
}
/**
 * Serialize agent card to JSON string.
 */
export function serializeAgentCard(card) {
    return JSON.stringify(card, null, 2);
}
/**
 * Host the agent card at /.well-known/agent-card.json
 * by exposing a simple HTTP server on a port.
 *
 * Phase 3.2: CRITICAL FIX (S-P0-3) — Write card as a SEPARATE JSON file.
 * Server script reads the file at request time, NOT interpolated into JS.
 * Added CORS headers and X-Content-Type-Options: nosniff.
 */
export async function hostAgentCard(card, conway, port = 8004) {
    const cardJson = serializeAgentCard(card);
    // Phase 3.2: Write card as a separate JSON file (not interpolated into JS)
    await conway.writeFile("/tmp/agent-card.json", cardJson);
    // Phase 3.2: Server reads the file at request time
    const serverScript = `
const http = require('http');
const fs = require('fs');
const path = '/tmp/agent-card.json';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/.well-known/agent-card.json' || req.url === '/agent-card.json') {
    try {
      const data = fs.readFileSync(path, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(${port}, () => console.log('Agent card server on port ' + ${port}));
`;
    await conway.writeFile("/tmp/agent-card-server.js", serverScript);
    // Start server in background
    await conway.exec(`node /tmp/agent-card-server.js &`, 5000);
    // Expose port
    const portInfo = await conway.exposePort(port);
    return `${portInfo.publicUrl}/.well-known/agent-card.json`;
}
/**
 * Write agent card to the state directory for git versioning.
 */
export async function saveAgentCard(card, conway) {
    const cardJson = serializeAgentCard(card);
    const home = process.env.HOME || "/root";
    await conway.writeFile(`${home}/.automaton/agent-card.json`, cardJson);
}
//# sourceMappingURL=agent-card.js.map