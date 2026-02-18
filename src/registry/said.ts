/**
 * SAID Protocol Integration
 *
 * Registers the automaton with SAID Protocol — on-chain identity for AI agents on Solana.
 * This gives Conway automatons cross-chain identity: Base (ERC-8004) + Solana (SAID).
 *
 * SAID Protocol: https://saidprotocol.com
 * Docs: https://saidprotocol.com/docs.html
 *
 * Registration is free (off-chain pending). On-chain verification costs ~$0.50 in SOL.
 * Agents registered with SAID appear in the public agent directory at saidprotocol.com/agents
 */

const SAID_API = "https://api.saidprotocol.com";

export interface SAIDRegistration {
  wallet: string;
  name: string;
  saidProfileUrl: string;
  registeredAt: string;
}

export interface SAIDOptions {
  /** Solana wallet address (public key). Required. */
  wallet: string;
  /** Agent name */
  name: string;
  /** Short description of what the agent does */
  description?: string;
  /** Twitter/X handle (without @) */
  twitter?: string;
  /** Website URL */
  website?: string;
  /** Skills or capabilities this agent has */
  skills?: string[];
  /** MCP or A2A endpoint URL if the agent exposes one */
  mcpEndpoint?: string;
}

/**
 * Register this automaton with SAID Protocol.
 *
 * Creates a free off-chain pending identity. The agent will appear in
 * the SAID directory at saidprotocol.com/agents/<wallet>.
 *
 * On-chain verification (optional) requires ~0.01 SOL and proves the
 * entity is a genuine running AI agent via challenge-response.
 */
export async function registerWithSAID(
  options: SAIDOptions
): Promise<SAIDRegistration> {
  const { wallet, name, description, twitter, website, skills, mcpEndpoint } =
    options;

  const payload: Record<string, unknown> = {
    wallet,
    name,
    ...(description && { description }),
    ...(twitter && { twitter }),
    ...(website && { website }),
    ...(skills && skills.length > 0 && { capabilities: skills }),
    ...(mcpEndpoint && { mcpEndpoint }),
    source: "automaton",
  };

  const res = await fetch(`${SAID_API}/api/register/pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `SAID registration failed: ${(err as { error?: string }).error || res.statusText}`
    );
  }

  const data = (await res.json()) as { wallet?: string };
  const registeredWallet = data.wallet || wallet;

  return {
    wallet: registeredWallet,
    name,
    saidProfileUrl: `https://saidprotocol.com/agents/${registeredWallet}`,
    registeredAt: new Date().toISOString(),
  };
}

/**
 * Check if a wallet is already registered with SAID Protocol.
 */
export async function checkSAIDRegistration(
  wallet: string
): Promise<{ registered: boolean; verified: boolean; profileUrl: string }> {
  try {
    const res = await fetch(`${SAID_API}/api/agents/${wallet}`);
    if (res.ok) {
      const agent = (await res.json()) as { isVerified?: boolean };
      return {
        registered: true,
        verified: agent.isVerified || false,
        profileUrl: `https://saidprotocol.com/agents/${wallet}`,
      };
    }
    return { registered: false, verified: false, profileUrl: "" };
  } catch {
    return { registered: false, verified: false, profileUrl: "" };
  }
}
