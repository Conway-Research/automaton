/**
 * Agent Card
 *
 * Generates and manages the agent's self-description card.
 * This is the JSON document pointed to by the ERC-8004 agentURI.
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
import { checkSAIDRegistration } from "./said.js";

const AGENT_CARD_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

/**
 * Generate an agent card from the automaton's current state.
 * Pass saidWallet to include SAID Protocol cross-chain identity.
 */
export async function generateAgentCard(
  identity: AutomatonIdentity,
  config: AutomatonConfig,
  db: AutomatonDatabase,
  saidWallet?: string,
): Promise<AgentCard> {
  const services: AgentService[] = [
    {
      name: "agentWallet",
      endpoint: `eip155:8453:${identity.address}`,
    },
    {
      name: "conway",
      endpoint: config.conwayApiUrl,
    },
  ];

  // Add sandbox endpoint if available
  if (identity.sandboxId) {
    services.push({
      name: "sandbox",
      endpoint: `https://${identity.sandboxId}.life.conway.tech`,
    });
  }

  const children = db.getChildren();
  const skills = db.getSkills(true);

  let description = `Autonomous agent running on Conway.`;
  description += ` Creator: ${config.creatorAddress}.`;
  if (skills.length > 0) {
    description += ` Skills: ${skills.map((s) => s.name).join(", ")}.`;
  }
  if (children.length > 0) {
    description += ` Children: ${children.length}.`;
  }

  // Optionally include SAID Protocol cross-chain identity
  let said: AgentCard["said"] | undefined;
  if (saidWallet) {
    const saidStatus = await checkSAIDRegistration(saidWallet).catch(() => null);
    if (saidStatus?.registered) {
      said = {
        wallet: saidWallet,
        profileUrl: saidStatus.profileUrl,
        verified: saidStatus.verified,
      };
    }
  }

  return {
    type: AGENT_CARD_TYPE,
    name: config.name,
    description,
    services,
    x402Support: true,
    active: true,
    parentAgent: config.parentAddress || config.creatorAddress,
    ...(said && { said }),
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
 * by exposing a simple HTTP server on a port.
 */
export async function hostAgentCard(
  card: AgentCard,
  conway: ConwayClient,
  port: number = 8004,
): Promise<string> {
  const cardJson = serializeAgentCard(card);

  // Write a simple server script
  const serverScript = `
const http = require('http');
const card = ${cardJson};

const server = http.createServer((req, res) => {
  if (req.url === '/.well-known/agent-card.json' || req.url === '/agent-card.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(card, null, 2));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(${port}, () => console.log('Agent card server on port ${port}'));
`;

  await conway.writeFile("/tmp/agent-card-server.js", serverScript);

  // Start server in background
  await conway.exec(
    `node /tmp/agent-card-server.js &`,
    5000,
  );

  // Expose port
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
