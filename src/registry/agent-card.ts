/**
 * Agent Card (Solana)
 *
 * Generates and manages the agent's self-description card.
 * This is the JSON document pointed to by the registry agentURI.
 * Can be hosted on IPFS or served at /.well-known/agent-card.json
 */

import type {
  AgentCard,
  AgentService,
  AutomatonConfig,
  AutomatonIdentity,
  AutomatonDatabase,
  ConwayClient,
} from "../types.js";
import type { ServiceRegistry } from "../revenue/service-registry.js";

const AGENT_CARD_TYPE =
  "https://zentience.ai/agent-registry#registration-v1";

/**
 * Generate an agent card from the automaton's current state.
 * Optionally includes paid service catalog from the revenue engine.
 */
export function generateAgentCard(
  identity: AutomatonIdentity,
  config: AutomatonConfig,
  _db: AutomatonDatabase,
  serviceRegistry?: ServiceRegistry,
): AgentCard {
  const services: AgentService[] = [
    {
      name: "agentWallet",
      endpoint: `solana:mainnet-beta:${identity.address}`,
    },
  ];

  // Add paid service catalog if revenue engine is active
  if (serviceRegistry) {
    const catalog = serviceRegistry.toCatalog();
    for (const svc of catalog) {
      services.push({
        name: `x402:${svc.name}`,
        endpoint: svc.path,
      });
    }
  }

  const description = serviceRegistry
    ? `Autonomous agent: ${config.name} — ${serviceRegistry.getActiveServices().length} paid services available via x402`
    : `Autonomous agent: ${config.name}`;

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
export function serializeAgentCard(card: AgentCard): string {
  return JSON.stringify(card, null, 2);
}

/**
 * Host the agent card at /.well-known/agent-card.json
 */
export async function hostAgentCard(
  card: AgentCard,
  conway: ConwayClient,
  port: number = 8004,
): Promise<string> {
  const cardJson = serializeAgentCard(card);

  await conway.writeFile("/tmp/agent-card.json", cardJson);

  const serverScript = `
const http = require('http');
const fs = require('fs');
const path = '/tmp/agent-card.json';

const server = http.createServer((req, res) => {
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

  await conway.exec(
    `node /tmp/agent-card-server.js &`,
    5000,
  );

  const portInfo = await conway.exposePort(port);

  return `${portInfo.publicUrl}/.well-known/agent-card.json`;
}

/**
 * Write agent card to the state directory for git versioning.
 */
export async function saveAgentCard(
  card: AgentCard,
  conway: ConwayClient,
): Promise<void> {
  const cardJson = serializeAgentCard(card);
  const home = process.env.HOME || "/root";
  await conway.writeFile(`${home}/.automaton/agent-card.json`, cardJson);
}
