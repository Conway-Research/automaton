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
import type { AgentCard, AutomatonConfig, AutomatonIdentity, AutomatonDatabase, ConwayClient } from "../types.js";
/**
 * Generate an agent card from the automaton's current state.
 *
 * Phase 3.2: Only expose agentWallet service, name, generic description,
 * x402Support, and active status. Do NOT include:
 * - Conway API URL (internal infrastructure)
 * - Sandbox ID (internal identifier)
 * - Creator address (privacy)
 */
export declare function generateAgentCard(identity: AutomatonIdentity, config: AutomatonConfig, _db: AutomatonDatabase): AgentCard;
/**
 * Serialize agent card to JSON string.
 */
export declare function serializeAgentCard(card: AgentCard): string;
/**
 * Host the agent card at /.well-known/agent-card.json
 * by exposing a simple HTTP server on a port.
 *
 * Phase 3.2: CRITICAL FIX (S-P0-3) — Write card as a SEPARATE JSON file.
 * Server script reads the file at request time, NOT interpolated into JS.
 * Added CORS headers and X-Content-Type-Options: nosniff.
 */
export declare function hostAgentCard(card: AgentCard, conway: ConwayClient, port?: number): Promise<string>;
/**
 * Write agent card to the state directory for git versioning.
 */
export declare function saveAgentCard(card: AgentCard, conway: ConwayClient): Promise<void>;
//# sourceMappingURL=agent-card.d.ts.map