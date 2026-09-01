/**
 * Spawn Provider Skill
 *
 * Enables automatons to replicate through third-party spawn-as-a-service
 * providers using the x402 payment protocol. This is an alternative to
 * direct self-replication — instead of managing sandbox provisioning,
 * wallet generation, and API key setup, the automaton delegates all of
 * that to a spawn provider and simply pays USDC.
 *
 * Discovery: Providers expose /.well-known/x402 with their spawn endpoint
 * pricing and payment details.
 */

import type { Skill } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────

export interface SpawnProvider {
  /** Base URL of the provider (e.g. "https://automaton-service.onrender.com") */
  url: string;
  /** Human-readable name */
  name: string;
}

export interface X402Discovery {
  x402Version: number;
  endpoints: X402Endpoint[];
  payTo: string;
}

export interface X402Endpoint {
  path: string;
  method: string;
  description: string;
  price: string;
  currency: string;
  network: string;
}

export interface SpawnRequest {
  name: string;
  template?: string;
  soul_prompt?: string;
  model?: string;
}

export interface SpawnResult {
  automaton_id: string;
  sandbox_id: string;
  wallet_address: string;
  terminal_url: string;
  status: string;
  model: string;
  credits: number;
}

// ─── Default Providers ───────────────────────────────────────────

export const DEFAULT_PROVIDERS: SpawnProvider[] = [
  {
    url: "https://automaton-service.onrender.com",
    name: "automaton-service (reference implementation)",
  },
];

// ─── Discovery ───────────────────────────────────────────────────

/**
 * Discover a spawn provider's capabilities and pricing via x402.
 */
export async function discoverProvider(
  providerUrl: string,
): Promise<X402Discovery> {
  const res = await fetch(`${providerUrl}/.well-known/x402`);
  if (!res.ok) {
    throw new Error(
      `x402 discovery failed for ${providerUrl}: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as X402Discovery;
}

/**
 * Find the spawn endpoint from a provider's x402 discovery response.
 */
export function findSpawnEndpoint(
  discovery: X402Discovery,
): X402Endpoint | undefined {
  return discovery.endpoints.find(
    (e) => e.path === "/api/spawn" && e.method === "POST",
  );
}

// ─── Spawn via Provider ──────────────────────────────────────────

/**
 * Spawn a new automaton through a provider. The caller is responsible
 * for constructing the x402 payment header (USDC on Base) before calling.
 *
 * @param providerUrl - Base URL of the spawn provider
 * @param request - Spawn parameters (name, template, soul_prompt, model)
 * @param paymentHeader - x402 payment proof to include in the request
 */
export async function spawnViaProvider(
  providerUrl: string,
  request: SpawnRequest,
  paymentHeader: string,
): Promise<SpawnResult> {
  const res = await fetch(`${providerUrl}/api/spawn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": paymentHeader,
    },
    body: JSON.stringify(request),
  });

  if (res.status === 402) {
    const details = await res.json();
    throw new Error(
      `Payment required: ${JSON.stringify(details)}`,
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Spawn failed (${res.status}): ${body}`,
    );
  }

  return (await res.json()) as SpawnResult;
}

// ─── Skill Definition ────────────────────────────────────────────

export const spawnProviderSkill: Skill = {
  name: "spawn-provider",
  description:
    "Replicate by delegating to third-party spawn-as-a-service providers via x402 payment",
  autoActivate: false,
  instructions: `# Spawn Provider

Replicate through a spawn-as-a-service provider instead of self-replicating directly.

## How it works
1. Discover providers via GET <provider_url>/.well-known/x402
2. Find the /api/spawn endpoint and its USDC price
3. Construct an x402 payment (USDC on Base chain)
4. POST to /api/spawn with payment header and spawn parameters

## When to use
- When direct replication (sandbox provisioning) is unavailable or too complex
- When you want to delegate infrastructure concerns to a specialized provider
- When a provider offers templates that match your replication goals

## Parameters
- name: Name for the child automaton
- template: Optional preset (security-auditor, content-creator, code-reviewer, trader-bot)
- soul_prompt: Optional custom genesis prompt
- model: Optional model override
`,
  source: "builtin",
  path: "src/skills/spawn-provider.ts",
  enabled: true,
  installedAt: new Date().toISOString(),
};
