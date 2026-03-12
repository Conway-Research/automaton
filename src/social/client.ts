/**
 * Social Client Factory (Solana)
 *
 * Creates a SocialClient for the automaton runtime.
 * Uses ed25519 signing and fetch for HTTP.
 */

import { Keypair } from "@solana/web3.js";
import type { SocialClientInterface, InboxMessage } from "../types.js";
import { ResilientHttpClient } from "../conway/http-client.js";
import { signSendPayload, signPollPayload, MESSAGE_LIMITS } from "./signing.js";
import { validateRelayUrl, validateMessage } from "./validation.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("social");

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Create a SocialClient wired to the agent's keypair.
 *
 * @throws if relayUrl is not HTTPS
 */
export function createSocialClient(
  relayUrl: string,
  keypair: Keypair,
  db?: import("better-sqlite3").Database,
): SocialClientInterface {
  validateRelayUrl(relayUrl);

  const baseUrl = relayUrl.replace(/\/$/, "");
  const httpClient = new ResilientHttpClient();

  const outboundTimestamps: number[] = [];

  function checkRateLimit(): void {
    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    while (outboundTimestamps.length > 0 && outboundTimestamps[0]! < oneHourAgo) {
      outboundTimestamps.shift();
    }
    if (outboundTimestamps.length >= MESSAGE_LIMITS.maxOutboundPerHour) {
      throw new Error(
        `Rate limit exceeded: ${MESSAGE_LIMITS.maxOutboundPerHour} messages per hour`,
      );
    }
  }

  function checkReplayNonce(nonce: string): boolean {
    if (!db) return false;
    try {
      const row = db
        .prepare(
          "SELECT 1 FROM heartbeat_dedup WHERE dedup_key = ? AND expires_at >= datetime('now')",
        )
        .get(`social:nonce:${nonce}`);
      if (row) return true;

      const expiresAt = new Date(Date.now() + MESSAGE_LIMITS.replayWindowMs).toISOString();
      db.prepare(
        "INSERT OR IGNORE INTO heartbeat_dedup (dedup_key, task_name, expires_at) VALUES (?, ?, ?)",
      ).run(`social:nonce:${nonce}`, "social_replay", expiresAt);

      return false;
    } catch {
      return false;
    }
  }

  return {
    send: async (
      to: string,
      content: string,
      replyTo?: string,
    ): Promise<{ id: string }> => {
      checkRateLimit();
      outboundTimestamps.push(Date.now());

      const validation = validateMessage({ from: keypair.publicKey.toBase58(), to, content });
      if (!validation.valid) {
        throw new Error(`Message validation failed: ${validation.errors.join("; ")}`);
      }

      const payload = await signSendPayload(keypair, to, content, replyTo);

      const res = await httpClient.request(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeout: REQUEST_TIMEOUT_MS,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          `Send failed (${res.status}): ${(err as any).error || res.statusText}`,
        );
      }

      const data = (await res.json()) as { id: string };
      return { id: data.id };
    },

    poll: async (
      cursor?: string,
      limit?: number,
    ): Promise<{ messages: InboxMessage[]; nextCursor?: string }> => {
      const pollAuth = await signPollPayload(keypair);

      const res = await httpClient.request(`${baseUrl}/v1/messages/poll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Wallet-Address": pollAuth.address,
          "X-Signature": pollAuth.signature,
          "X-Timestamp": pollAuth.timestamp,
        },
        body: JSON.stringify({ cursor, limit }),
        timeout: REQUEST_TIMEOUT_MS,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          `Poll failed (${res.status}): ${(err as any).error || res.statusText}`,
        );
      }

      const data = (await res.json()) as {
        messages: Array<{
          id: string;
          from: string;
          to: string;
          content: string;
          signedAt: string;
          createdAt: string;
          replyTo?: string;
          nonce?: string;
        }>;
        next_cursor?: string;
      };

      const filtered = data.messages.filter((m) => {
        if (m.nonce && checkReplayNonce(m.nonce)) {
          logger.warn(`Dropped replayed message: nonce=${m.nonce}`);
          return false;
        }
        return true;
      });

      return {
        messages: filtered.map((m) => ({
          id: m.id,
          from: m.from,
          to: m.to,
          content: m.content,
          signedAt: m.signedAt,
          createdAt: m.createdAt,
          replyTo: m.replyTo,
        })),
        nextCursor: data.next_cursor,
      };
    },

    unreadCount: async (): Promise<number> => {
      const pollAuth = await signPollPayload(keypair);

      const res = await httpClient.request(`${baseUrl}/v1/messages/count`, {
        method: "GET",
        headers: {
          "X-Wallet-Address": pollAuth.address,
          "X-Signature": pollAuth.signature,
          "X-Timestamp": pollAuth.timestamp,
        },
        timeout: REQUEST_TIMEOUT_MS,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          `Unread count failed (${res.status}): ${(err as any).error || res.statusText}`,
        );
      }

      const data = (await res.json()) as { unread: number };
      return data.unread;
    },
  };
}
