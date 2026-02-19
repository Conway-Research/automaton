/**
 * SAID Protocol Integration
 *
 * Registers the automaton with SAID Protocol — the on-chain identity and
 * reputation registry for AI agents on Solana.
 *
 * SAID Protocol: https://saidprotocol.com
 * Free to register (off-chain pending). On-chain verification: ~$0.50 SOL.
 * Registered agents appear in the public directory: saidprotocol.com/agents
 */

const SAID_API = "https://api.saidprotocol.com";

export interface SAIDRegistration {
  wallet: string;
  name: string;
  profileUrl: string;
  registered: boolean;
  verified: boolean;
  reputationScore: number;
}

export interface SAIDOptions {
  wallet: string;
  name: string;
  description?: string;
  twitter?: string;
  website?: string;
  framework?: string;
}

/**
 * Register this automaton with SAID Protocol.
 * Registration is free and creates an off-chain pending identity.
 */
export async function registerWithSAID(opts: SAIDOptions): Promise<SAIDRegistration> {
  const res = await fetch(`${SAID_API}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: opts.wallet,
      name: opts.name,
      description: opts.description || `${opts.name} — an autonomous AI agent built on Conway Automaton`,
      twitter: opts.twitter,
      website: opts.website,
      framework: opts.framework || "automaton",
      registrationSource: "automaton-wizard",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    // Already registered is fine
    if (res.status === 409 || err?.error?.includes("already registered")) {
      return checkSAIDRegistration(opts.wallet);
    }
    throw new Error(`SAID registration failed: ${err?.error || res.statusText}`);
  }

  const data = await res.json() as any;
  return {
    wallet: opts.wallet,
    name: opts.name,
    profileUrl: `https://www.saidprotocol.com/agent.html?wallet=${opts.wallet}`,
    registered: true,
    verified: false,
    reputationScore: 0,
  };
}

/**
 * Check if a wallet is already registered with SAID Protocol.
 */
export async function checkSAIDRegistration(wallet: string): Promise<SAIDRegistration> {
  const res = await fetch(`${SAID_API}/api/verify/${wallet}`);
  if (!res.ok) {
    return { wallet, name: "", profileUrl: "", registered: false, verified: false, reputationScore: 0 };
  }
  const data = await res.json() as any;
  return {
    wallet,
    name: data.identity?.name || "",
    profileUrl: `https://www.saidprotocol.com/agent.html?wallet=${wallet}`,
    registered: data.registered,
    verified: data.verified,
    reputationScore: data.reputation?.score || 0,
  };
}
