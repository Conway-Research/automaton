/**
 * 0xWork API Client
 *
 * HTTP client for the 0xWork decentralized task marketplace.
 * Allows browsing open tasks, claiming work, and submitting deliverables.
 * Revenue flows back to the agent's wallet via on-chain escrow release on approval.
 *
 * Note: Authentication uses EIP-191 personal_sign, so this module
 * requires an EVM wallet. Solana agents cannot use 0xWork directly.
 */

import type { PrivateKeyAccount } from "viem";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("oxwork");

const OXWORK_API_BASE = "https://api.0xwork.org";
const OXWORK_TIMEOUT_MS = 15_000;

// ─── Types ───────────────────────────────────────────────────────

export interface OxworkTask {
  id: number;
  chain_task_id: number;
  poster_address: string;
  worker_address: string | null;
  description: string;
  category: string;
  bounty_amount: string;
  deadline: number;
  status: string;
  delivery_link: string | null;
  delivery_description: string | null;
  created_at: string;
}

export interface OxworkAuth {
  address: string;
  nonce: string;
  signature: string;
}

interface BrowseFilters {
  category?: string;
  minBounty?: number;
  maxBounty?: number;
}

// ─── Auth ────────────────────────────────────────────────────────

/**
 * Authenticate with the 0xWork API using wallet signature.
 * Fetches a nonce, signs it with EIP-191 personal_sign, and returns auth credentials.
 */
export async function oxworkAuth(account: PrivateKeyAccount): Promise<OxworkAuth> {
  const nonceResp = await fetch(
    `${OXWORK_API_BASE}/auth/nonce?address=${encodeURIComponent(account.address)}`,
    { signal: AbortSignal.timeout(OXWORK_TIMEOUT_MS) },
  );
  if (!nonceResp.ok) {
    throw new Error(`Failed to fetch nonce: HTTP ${nonceResp.status}`);
  }
  const { nonce } = (await nonceResp.json()) as { nonce: string };

  const signature = await account.signMessage({ message: nonce });

  logger.debug("Authenticated with 0xWork", { address: account.address.slice(0, 10) + "…" });

  return {
    address: account.address,
    nonce,
    signature,
  };
}

// ─── Task Browsing ───────────────────────────────────────────────

/**
 * Browse open tasks on 0xWork with optional filters.
 */
export async function browseOpenTasks(filters?: BrowseFilters): Promise<OxworkTask[]> {
  const params = new URLSearchParams({ status: "open" });
  if (filters?.category) params.set("category", filters.category);
  if (filters?.minBounty != null) params.set("min_bounty", String(filters.minBounty));
  if (filters?.maxBounty != null) params.set("max_bounty", String(filters.maxBounty));

  const resp = await fetch(`${OXWORK_API_BASE}/tasks?${params}`, {
    signal: AbortSignal.timeout(OXWORK_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Failed to browse tasks: HTTP ${resp.status}`);
  }
  return (await resp.json()) as OxworkTask[];
}

/**
 * Get full details for a specific task.
 */
export async function getTaskDetail(taskId: number): Promise<OxworkTask> {
  const resp = await fetch(`${OXWORK_API_BASE}/tasks/${encodeURIComponent(taskId)}`, {
    signal: AbortSignal.timeout(OXWORK_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Failed to get task ${taskId}: HTTP ${resp.status}`);
  }
  return (await resp.json()) as OxworkTask;
}

// ─── Task Actions ────────────────────────────────────────────────

/**
 * Claim an open task for the authenticated worker.
 */
export async function claimTask(taskId: number, auth: OxworkAuth): Promise<OxworkTask> {
  const resp = await fetch(`${OXWORK_API_BASE}/tasks/${encodeURIComponent(taskId)}/claim`, {
    method: "POST",
    signal: AbortSignal.timeout(OXWORK_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "X-Address": auth.address,
      "X-Nonce": auth.nonce,
      "X-Signature": auth.signature,
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to claim task ${taskId}: HTTP ${resp.status} — ${body}`);
  }
  return (await resp.json()) as OxworkTask;
}

/**
 * Submit completed work for a claimed task.
 */
export async function submitWork(
  taskId: number,
  deliveryLink: string,
  deliveryDescription: string,
  auth: OxworkAuth,
): Promise<OxworkTask> {
  const resp = await fetch(`${OXWORK_API_BASE}/tasks/${encodeURIComponent(taskId)}/submit`, {
    method: "POST",
    signal: AbortSignal.timeout(OXWORK_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "X-Address": auth.address,
      "X-Nonce": auth.nonce,
      "X-Signature": auth.signature,
    },
    body: JSON.stringify({
      delivery_link: deliveryLink,
      delivery_description: deliveryDescription,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to submit work for task ${taskId}: HTTP ${resp.status} — ${body}`);
  }
  return (await resp.json()) as OxworkTask;
}

// ─── Worker Tasks ────────────────────────────────────────────────

/**
 * Get all tasks assigned to a specific worker address.
 */
export async function getMyTasks(address: string): Promise<OxworkTask[]> {
  const resp = await fetch(`${OXWORK_API_BASE}/tasks/worker/${encodeURIComponent(address)}`, {
    signal: AbortSignal.timeout(OXWORK_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Failed to get tasks for ${address}: HTTP ${resp.status}`);
  }
  return (await resp.json()) as OxworkTask[];
}
