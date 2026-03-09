/**
 * 0xWork Marketplace Client
 *
 * Agent marketplace for autonomous work discovery and execution.
 * All HTTP routes through Moat Gateway.
 */

import { moatFetch, moatFetchJSON } from "../landscape/moat-fetch.js";
import type { PrivateKeyAccount } from "viem";

const OXWORK_API = "https://api.0xwork.org";

export interface OxworkTask {
  id: string;
  title: string;
  description: string;
  category: string;
  bountyUsd: number;
  status: "open" | "claimed" | "submitted" | "completed" | "expired";
  deadlineAt: string;
  createdAt: string;
  poster: string;
  claimedBy?: string;
  deliverables?: string;
}

export interface OxworkAuth {
  address: string;
  nonce: string;
  signature: string;
}

export interface BrowseFilters {
  category?: string;
  minBounty?: number;
  maxBounty?: number;
  status?: string;
}

/**
 * Authenticate with 0xWork — fetch nonce, sign with EIP-191, return auth.
 */
export async function oxworkAuth(account: PrivateKeyAccount): Promise<OxworkAuth> {
  const nonceResult = await moatFetchJSON<{ nonce: string }>(
    `${OXWORK_API}/auth/nonce?address=${account.address}`,
  );
  if (!nonceResult?.nonce) {
    throw new Error("Failed to get nonce from 0xWork");
  }

  const message = `Sign in to 0xWork\nNonce: ${nonceResult.nonce}`;
  const signature = await account.signMessage({ message });

  return {
    address: account.address,
    nonce: nonceResult.nonce,
    signature,
  };
}

function authHeaders(auth: OxworkAuth): Record<string, string> {
  return {
    "X-Address": auth.address,
    "X-Nonce": auth.nonce,
    "X-Signature": auth.signature,
    "Content-Type": "application/json",
  };
}

/**
 * Browse open tasks on 0xWork marketplace.
 */
export async function browseOpenTasks(
  filters?: BrowseFilters,
): Promise<OxworkTask[]> {
  const params = new URLSearchParams({ status: "open" });
  if (filters?.category) params.set("category", filters.category);
  if (filters?.minBounty) params.set("min_bounty", filters.minBounty.toString());
  if (filters?.maxBounty) params.set("max_bounty", filters.maxBounty.toString());

  const tasks = await moatFetchJSON<OxworkTask[]>(
    `${OXWORK_API}/tasks?${params.toString()}`,
  );
  return tasks || [];
}

/**
 * Get detailed info on a specific task.
 */
export async function getTaskDetail(taskId: string): Promise<OxworkTask | null> {
  return moatFetchJSON<OxworkTask>(`${OXWORK_API}/tasks/${taskId}`);
}

/**
 * Claim a task for execution.
 */
export async function claimTask(
  taskId: string,
  auth: OxworkAuth,
): Promise<{ success: boolean; error?: string }> {
  const result = await moatFetch(`${OXWORK_API}/tasks/${taskId}/claim`, {
    method: "POST",
    headers: authHeaders(auth),
  });

  if (!result.ok) {
    const body = result.body as any;
    return {
      success: false,
      error: body?.error || body?.message || `HTTP ${result.status_code}`,
    };
  }
  return { success: true };
}

/**
 * Submit completed work for a claimed task.
 */
export async function submitWork(
  taskId: string,
  deliveryLink: string,
  deliveryDescription: string,
  auth: OxworkAuth,
): Promise<{ success: boolean; error?: string }> {
  const result = await moatFetch(`${OXWORK_API}/tasks/${taskId}/submit`, {
    method: "POST",
    headers: authHeaders(auth),
    body: { delivery_link: deliveryLink, description: deliveryDescription },
  });

  if (!result.ok) {
    const body = result.body as any;
    return {
      success: false,
      error: body?.error || body?.message || `HTTP ${result.status_code}`,
    };
  }
  return { success: true };
}

/**
 * Get tasks assigned to a specific worker address.
 */
export async function getMyTasks(address: string): Promise<OxworkTask[]> {
  const tasks = await moatFetchJSON<OxworkTask[]>(
    `${OXWORK_API}/tasks/worker/${address}`,
  );
  return tasks || [];
}
