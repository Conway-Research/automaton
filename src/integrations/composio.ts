/**
 * Composio Integration
 *
 * Thin wrapper around @composio/core so the automaton can authorize and call
 * third-party toolkits (GitHub first) on behalf of a user.
 *
 * Requires COMPOSIO_API_KEY in the environment — create one at
 * https://platform.composio.dev. Composio provisions the OAuth app on first
 * use, so no auth config has to be set up by hand.
 */

import { Composio } from "@composio/core";
import type { ConnectedAccountRetrieveResponse, ConnectionRequest } from "@composio/core";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("composio");

export const GITHUB_TOOLKIT = "github";

/** How long `connectToolkit` waits for the user to finish OAuth, in ms. */
const DEFAULT_CONNECT_TIMEOUT_MS = 180_000;

let client: Composio | null = null;

/**
 * Lazily construct the shared Composio client.
 * Throws if COMPOSIO_API_KEY is missing so callers fail loudly at the boundary.
 */
export function getComposio(): Composio {
  if (!client) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      throw new Error(
        "COMPOSIO_API_KEY is not set. Create a key at https://platform.composio.dev and export it before starting the automaton."
      );
    }
    client = new Composio({ apiKey });
  }
  return client;
}

/** Reset the cached client. Useful in tests and after a key rotation. */
export function resetComposio(): void {
  client = null;
}

/**
 * True when `userId` already holds an ACTIVE connection for `toolkit`.
 * Check this before calling tools — execution against a missing or expired
 * connection fails at the provider, not at the SDK.
 */
export async function isConnected(userId: string, toolkit: string = GITHUB_TOOLKIT): Promise<boolean> {
  const accounts = await getComposio().connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkit],
    statuses: ["ACTIVE"],
    limit: 1,
  });
  return accounts.items.length > 0;
}

/**
 * Begin an OAuth flow for `toolkit`.
 * Returns the connection request — surface `redirectUrl` to the user, then
 * await `waitForConnection()` on the same object.
 */
export async function beginAuthorization(
  userId: string,
  toolkit: string = GITHUB_TOOLKIT
): Promise<ConnectionRequest> {
  const request = await getComposio().toolkits.authorize(userId, toolkit);
  logger.info(`Authorize ${toolkit} for ${userId}: ${request.redirectUrl ?? "(no redirect required)"}`);
  return request;
}

/**
 * Authorize `toolkit` and block until the connection goes ACTIVE.
 * No-op fast path when the user is already connected.
 */
export async function connectToolkit(
  userId: string,
  toolkit: string = GITHUB_TOOLKIT,
  timeoutMs: number = DEFAULT_CONNECT_TIMEOUT_MS
): Promise<ConnectedAccountRetrieveResponse> {
  const request = await beginAuthorization(userId, toolkit);
  const account = await request.waitForConnection(timeoutMs);
  logger.info(`Connected ${toolkit} for ${userId} (account ${account.id})`);
  return account;
}

/** Slugs of the tools available for a toolkit, e.g. GITHUB_CREATE_AN_ISSUE. */
export async function listToolSlugs(toolkit: string = GITHUB_TOOLKIT, limit = 50): Promise<string[]> {
  const tools = await getComposio().tools.getRawComposioTools({ toolkits: [toolkit], limit });
  return tools.map((tool) => tool.slug);
}

/**
 * Execute a Composio tool as `userId` and return its payload.
 * Throws on provider-side failure so callers do not have to branch on
 * `successful` at every call site.
 */
export async function executeTool(
  userId: string,
  slug: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const result = await getComposio().tools.execute(slug, { userId, arguments: args });
  if (!result.successful) {
    throw new Error(`Composio tool ${slug} failed: ${result.error ?? "unknown error"}`);
  }
  return result.data;
}

/** Convenience: the authenticated GitHub user for this connection. */
export async function getGithubUser(userId: string): Promise<Record<string, unknown>> {
  return executeTool(userId, "GITHUB_GET_THE_AUTHENTICATED_USER");
}
